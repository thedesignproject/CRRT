import { artifactSchema, manifestSchema, type ArtifactDeclaration } from './contracts.js'
import { allPages, canonical, checked, command, database, digest, limit, owned, parse, RecordError, type RecordingRow } from './core.js'

import { recordObjectStorage, resumableAuthorization } from './object-storage.js'
import { authorizeMultipart, completeMultipart } from './multipart.js'
import { r2Storage } from './r2.js'
export { RECORD_BUCKET } from './object-storage.js'
export type ArtifactRow = { id: string; recording_id: string; kind: string; path: string; mime: string; bytes: number; sha256: string; offset_ms: number; verified_at: string | null }
export function sourcePath(owner: string, recording: string, artifact: Pick<ArtifactDeclaration, 'id'>) {
  return `${owner}/${recording}/${artifact.id}.webm`
}
export function checkPath(recording: string, path: string) {
  // Source and derived paths are flat, immutable UUID-scoped objects. Never
  // accept URLs, traversal, a different recording, or the feedback namespace.
  if (!new RegExp(`^[a-f0-9-]{36}/${recording}/[a-f0-9-]{36}\\.(webm|jpg|png)$`).test(path)) throw new RecordError('record_artifact_scope', 503)
}
export async function artifacts(id: string): Promise<ArtifactRow[]> {
  return allPages<ArtifactRow>((from, to) => database().from('recording_artifacts').select('*').eq('recording_id', id).order('id').range(from, to))
}
export async function authorizeUpload(actor: string, id: string, body: unknown) {
  const recording = await owned(actor, id)
  const artifact = parse(artifactSchema, body)
  const path = sourcePath(actor, id, artifact)
  await command(actor, id, 'upload', { artifact: { ...artifact, path }, byteLimit: limit('RECORD_MAX_STORAGE_BYTES', 5_368_709_120) })
  if (recording.storage_provider === 'r2') return authorizeMultipart(actor, recording, artifact.id)
  const signed = checked(await recordObjectStorage(recording).signUpload(path))
  if (!signed) throw new RecordError('record_unavailable', 503, true)
  // Mint first, then recheck ownership/deletion. A returned token therefore
  // predates any later deletion's two-hour cleanup grace.
  await owned(actor, id)
  return { version: 'record.v1', recordingId: recording.id, artifactId: artifact.id, path, ...resumableAuthorization(path, artifact.mime, signed.token) }
}
export async function completeArtifact(actor: string, id: string, artifactId: string) {
  const recording = await owned(actor, id)
  const declared = (await artifacts(id)).find(a => a.id === artifactId)
  if (!declared) throw new RecordError('record_not_found', 404)
  checkPath(id, declared.path)
  const info = recording.storage_provider === 'r2' ? await completeMultipart(recording, declared) : await recordObjectStorage(recording).inspect(declared.path)
  if (info.error) throw new RecordError('record_upload_incomplete', 409, true)
  if (info.data.size !== declared.bytes || info.data.contentType !== declared.mime) throw new RecordError('record_artifact_mismatch', 409)
  await command(actor, id, 'complete', { artifactId })
  return { artifactId, complete: true }
}
export async function finalizeRecording(actor: string, id: string, body: unknown) {
  const recording = await owned(actor, id)
  const manifest = parse(manifestSchema, body)
  if (recording.source !== 'tab' && manifest.events.some(e => e.target !== undefined)) throw new RecordError('record_invalid', 400)
  const declared = (await artifacts(id)).filter(a => ['screen', 'camera', 'audio'].includes(a.kind))
  const expected = declared.map(a => ({ id: a.id, kind: a.kind, mime: a.mime, bytes: a.bytes, sha256: a.sha256, offsetMs: a.offset_ms })).sort((a, b) => a.id.localeCompare(b.id))
  const actual = [...manifest.artifacts].sort((a, b) => a.id.localeCompare(b.id))
  if (canonical(expected) !== canonical(actual)) throw new RecordError('record_artifact_mismatch', 409)
  // Completed artifacts are checked again at finalize. Workers independently
  // verify SHA-256 from storage before using bytes in processing.
  for (const a of declared) await completeArtifact(actor, id, a.id)
  const row = await command(actor, id, 'finalize', { manifest, manifestHash: digest(canonical(manifest)), byteLimit: limit('RECORD_MAX_STORAGE_BYTES', 5_368_709_120) })
  return { id: row.id, state: row.state, revision: row.revision }
}
export async function deleteRecording(actor: string, id: string) {
  const row = checked(await database().from('recordings').select('*').eq('id', id).eq('owner_id', actor).maybeSingle()) as RecordingRow | null
  if (!row) throw new RecordError('record_not_found', 404)
  if (!row.deleted_at) await command(actor, id, 'delete', {})
  return { id, deleted: true, cleanupWithinHours: 26 }
}
export async function cleanupObjects(id: string) {
  const recording = checked(await database().from('recordings').select('storage_prefix,storage_provider,storage_bucket').eq('id', id).maybeSingle()) as RecordingRow | null
  if (!recording) throw new RecordError('record_not_found', 404)
  const prefix = recording.storage_prefix as string
  checkPath(id, `${prefix}/${id}.jpg`)
  const storage = recordObjectStorage(recording)
  if (recording.storage_provider === 'r2') {
    for (const artifact of await artifacts(id)) {
      checkPath(id, artifact.path)
      const upload = (artifact as ArtifactRow & { multipart_id?: string }).multipart_id
      if (upload) await r2Storage(recording.storage_bucket!).abort(artifact.path, upload)
    }
  }
  for (let page = 0; page < 20; page++) {
    const objects = checked(await storage.list(prefix, 100))
    if (!objects) throw new RecordError('record_unavailable', 503, true)
    if (!objects.length) break
    const paths = objects.map(object => `${prefix}/${object.name}`)
    paths.forEach(path => checkPath(id, path))
    checked(await storage.remove(paths))
    if (page === 19) throw new RecordError('record_cleanup_pending', 503, true)
  }
}
