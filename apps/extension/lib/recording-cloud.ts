import { browser } from 'wxt/browser'
import { artifactSchema, manifestSchema, type Manifest } from '../../../shared/record/contracts'
import { recordRequest, type RecordingPlayback, type RecordingSummary } from '../../../shared/record/client'
import { boundedRecordingPoints, normalizeRecordingTitle, type LocalRecording } from './recording'
import { compactRecordingManifest, MAX_RECORDING_REQUEST_BYTES, recordingManifestBytes } from './recording-manifest'
import { getLocalRecording, saveLocalRecording } from './recording-store'
import { uploadRecordingArtifact, type UploadCheckpoint, type UploadAuthorization } from './recording-upload'
import { uploadMultipart, type MultipartAuthorization } from './recording-multipart'

export type CloudRecording = {
  id: string; shareId: string | null; authorId: string; manifest: Manifest
  uploads: Record<string, UploadCheckpoint>; finalized?: boolean
}
export const recordingApi = import.meta.env.WXT_API_BASE
export async function recordingToken() {
  const response = await browser.runtime.sendMessage({ type: 'auth:get' })
  if (!response?.ok || !response.data?.accessToken) throw new Error('Sign in to CRRT to upload recordings.')
  return response.data.accessToken as string
}
export async function ownerRecordRequest<T>(path: string, body?: unknown, method?: string) {
  return recordRequest<T>(recordingApi, path, await recordingToken(), body, method)
}
const blobs = (r: LocalRecording) => ({ screen: r.screenBlob, camera: r.cameraBlob, audio: r.audioBlob })
export async function recordingManifest(recording: LocalRecording): Promise<Manifest> {
  const artifacts = []
  for (const [kind, blob] of Object.entries(blobs(recording))) {
    if (!blob?.size) continue
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    artifacts.push(artifactSchema.parse({ id: crypto.randomUUID(), kind, mime: kind === 'audio' ? 'audio/webm' : 'video/webm', bytes: blob.size, sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), offsetMs: 0 }))
  }
  return compactRecordingManifest(manifestSchema.parse({ version: 'record.v1', durationMs: Math.round(recording.durationMs), artifacts,
    events: [...recording.marks].sort((a, b) => a.atMs - b.atMs).map((mark, sequence) => ({
      id: mark.id, sequence, atMs: Math.round(mark.atMs), kind: 'mark',
      mark: { type: mark.type, points: boundedRecordingPoints(mark.points).map(p => ({ x: Math.min(1, Math.max(0, p.x / 100)), y: Math.min(1, Math.max(0, p.y / 100)) })), ...(mark.text === undefined ? {} : { text: mark.text }), ...(mark.pinNumber === undefined ? {} : { pinNumber: mark.pinNumber }) },
      ...(recording.source === 'tab' && mark.target ? { target: mark.target } : {}),
    })),
  }))
}
// One upload per recording in this document. Durable checkpoints survive reloads;
// a Web Lock also serializes other recorder windows in Chrome.
const active = new Map<string, Promise<LocalRecording>>()
export function syncRecording(recording: LocalRecording, changed: (recording: LocalRecording) => void) {
  const existing = active.get(recording.id)
  if (existing) return existing
  const run = async () => sync(await getLocalRecording(recording.id) || recording, changed)
  const task = (navigator.locks ? navigator.locks.request(`crrt-record-upload:${recording.id}`, run) : run()).finally(() => active.delete(recording.id))
  active.set(recording.id, task)
  return task
}
async function sync(input: LocalRecording, changed: (recording: LocalRecording) => void) {
  let recording = input
  const token = await recordingToken()
  const request = <T>(path: string, body?: unknown) => recordRequest<T>(recordingApi, path, token, body)
  const persist = async () => { recording = { ...recording }; await saveLocalRecording(recording); changed(recording) }
  if (!recording.cloud) {
    recording = { ...recording, title: normalizeRecordingTitle(recording.title) }
    const manifest = await recordingManifest(recording)
    const created = await request<{ recording: RecordingSummary; shareId: string | null }>('recordings', {
      clientKey: recording.id, title: recording.title, source: recording.source,
      consent: { policyVersion: 'record-v1', hostedTranscription: recording.hostedTranscription === true, provider: 'deepgram', language: 'multi' },
    })
    recording = { ...recording, cloud: { id: created.recording.id, authorId: created.recording.authorId, shareId: created.shareId, manifest, uploads: {} } }
    await persist()
  }
  const cloud = recording.cloud!
  // Requests larger than the API limit could never have finalized. Repair only
  // those staged manifests, preserving artifact IDs and every previously accepted
  // manifest byte-for-byte so a lost finalize response remains idempotent.
  if (!cloud.finalized && recordingManifestBytes(cloud.manifest) > MAX_RECORDING_REQUEST_BYTES) {
    cloud.manifest = compactRecordingManifest(cloud.manifest)
    await persist()
  }
  await request(`recordings/${cloud.id}`)
  if (!cloud.finalized) {
    for (const artifact of cloud.manifest.artifacts) {
      const checkpoint = cloud.uploads[artifact.id] ??= {}
      if (checkpoint.complete) continue
      const blob = blobs(recording)[artifact.kind]
      if (!blob) throw new Error('The local media needed to resume this upload is unavailable.')
      // Completion may have succeeded despite a lost response. Check before creating another session.
      try { await request(`recordings/${cloud.id}/complete`, { artifactId: artifact.id }); checkpoint.complete = true; await persist(); continue } catch { /* authorization and upload below recheck ownership */ }
      const authorization = await request<UploadAuthorization | MultipartAuthorization>(`recordings/${cloud.id}/uploads`, artifact)
      if (authorization.protocol === 's3-multipart') await uploadMultipart(blob, authorization, body => request(`recordings/${cloud.id}/upload-parts`, body))
      else await uploadRecordingArtifact(blob, authorization, checkpoint, persist)
      await request(`recordings/${cloud.id}/complete`, { artifactId: artifact.id })
      checkpoint.complete = true
      await persist()
    }
    await request(`recordings/${cloud.id}/finalize`, cloud.manifest)
    cloud.finalized = true
    await persist()
  }
  return recording
}
export const readRecordingPlayback = (id: string) => ownerRecordRequest<RecordingPlayback>(`recordings/${id}/playback`)
