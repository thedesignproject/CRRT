import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { checked, database, digest, RecordError, type RecordingRow } from './core.js'
import { checkPath, RECORD_BUCKET, type ArtifactRow } from './storage.js'

export type DerivedArtifact = { id: string; kind: 'thumbnail' | 'keyframe' | 'crop'; path: string; mime: string; bytes: number; sha256: string }
export type MediaOutput = { metadata?: { durationMs: number; width: number; height: number }; artifacts: DerivedArtifact[]; keyframes: { id: string; eventId: string; atMs: number; artifactId: string; cropArtifactId?: string }[] }
export type Transcript = { source: string; language: string; segments: { id: string; startMs: number; endMs: number; text: string }[] }
export interface MediaProcessor {
  derive(recording: RecordingRow, artifacts: ArtifactRow[], signal: AbortSignal, checkWrite: () => Promise<void>): Promise<MediaOutput>
  audio(recording: RecordingRow, artifacts: ArtifactRow[], signal: AbortSignal): Promise<Uint8Array | null>
}
export function derivedId(recording: string, key: string) {
  const h = digest(`${recording}:${key}`)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
async function run(binary: string, args: string[], signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { signal, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stderr.resume()
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 1_000_000) child.kill() })
    const timeout = setTimeout(() => child.kill(), 120_000)
    child.on('error', () => { clearTimeout(timeout); reject(new RecordError('record_media_worker_unavailable', 503, true)) })
    child.on('close', code => { clearTimeout(timeout); if (code === 0) resolve(output); else reject(new RecordError('record_media_invalid', 422)) })
  })
}
async function download(artifact: ArtifactRow, directory: string, signal: AbortSignal) {
  checkPath(artifact.recording_id, artifact.path)
  const signed = checked(await database().storage.from(RECORD_BUCKET).createSignedUrl(artifact.path, 600))
  if (!signed) throw new RecordError('record_unavailable', 503, true)
  const response = await fetch(signed.signedUrl, { signal })
  if (!response.ok || !response.body) throw new RecordError('record_media_download', 503, true)
  const path = join(directory, `${artifact.id}.webm`)
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(path), { signal })
  if ((await stat(path)).size !== artifact.bytes) throw new RecordError('record_artifact_mismatch', 422)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest('hex') !== artifact.sha256) throw new RecordError('record_artifact_mismatch', 422)
  return path
}
export async function saveDerived(recording: string, source: ArtifactRow, key: string, kind: DerivedArtifact['kind'], bytes: Uint8Array, guard: { signal: AbortSignal; check: () => Promise<void> }): Promise<DerivedArtifact> {
  const id = derivedId(recording, key)
  const path = `${source.path.slice(0, source.path.lastIndexOf('/'))}/${id}.jpg`
  checkPath(recording, path)
  const bucket = database().storage.from(RECORD_BUCKET)
  if (guard.signal.aborted) throw new RecordError('record_job_cancelled', 409)
  await guard.check()
  const authorization = checked(await bucket.createSignedUploadUrl(path, { upsert: false }))
  if (!authorization) throw new RecordError('record_unavailable', 503, true)
  // Recheck after minting, so any usable token predates deletion's grace.
  await guard.check()
  const response = await fetch(authorization.signedUrl, { method: 'PUT', body: Buffer.from(bytes),
    headers: { 'Content-Type': 'image/jpeg' }, signal: AbortSignal.any([guard.signal, AbortSignal.timeout(60_000)]) })
  if (!response.ok) {
    // An expired worker can have completed this exact immutable object. Never
    // overwrite it: reuse only when the bytes match this derivation.
    const previous = checked(await bucket.download(path))
    if (!previous || digest(new Uint8Array(await previous.arrayBuffer())) !== digest(bytes)) throw new RecordError('record_derivation_conflict', 409)
  }
  if (guard.signal.aborted) throw new RecordError('record_job_cancelled', 409)
  await guard.check()
  return { id, kind, path, mime: 'image/jpeg', bytes: bytes.length, sha256: digest(bytes) }
}
export const ffmpegProcessor: MediaProcessor = {
  async derive(recording, artifacts, signal, checkWrite) {
    const directory = await mkdtemp(join(tmpdir(), 'crrt-record-'))
    try {
      const screen = artifacts.find(a => a.kind === 'screen')
      if (!screen || !recording.manifest || !recording.duration_ms) throw new RecordError('record_manifest_missing', 422)
      const captured = await download(screen, directory, signal)
      // Live MediaRecorder chunks can omit Duration/Cues. Stream-copy once to
      // compute duration and write an index, without re-encoding source media.
      const source = join(directory, 'indexed.mkv')
      await run('ffmpeg', ['-v', 'error', '-y', '-protocol_whitelist', 'file', '-f', 'matroska', '-i', captured, '-map', '0', '-c', 'copy', '-f', 'matroska', source], signal)
      const metadata = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source], signal))
      const durationMs = Math.round(Number(metadata.format.duration) * 1000)
      if (!Number.isFinite(durationMs) || Math.abs(durationMs - recording.duration_ms) > 2000 || !metadata.streams.some((s: any) => s.codec_type === 'video')) throw new RecordError('record_duration_mismatch', 422)
      // Verify auxiliary tracks independently; a bad camera must not silently
      // turn into an externally playable, unverified artifact.
      for (const artifact of artifacts.filter(a => a.kind !== 'screen')) await download(artifact, directory, signal)
      const video = metadata.streams.find((s: any) => s.codec_type === 'video')
      const output: MediaOutput = { metadata: { durationMs, width: video.width, height: video.height }, artifacts: [], keyframes: [] }
      async function image(atMs: number, key: string, kind: DerivedArtifact['kind'], crop?: { x: number; y: number; width: number; height: number }) {
        const destination = join(directory, `${derivedId(recording.id, key)}.jpg`)
        const width = crop ? Math.max(1, Math.round(video.width * crop.width)) : video.width
        const height = crop ? Math.max(1, Math.round(video.height * crop.height)) : video.height
        const resize = Math.min(640 / width, 640 / height)
        const cropFilter = crop ? `crop=${width}:${height}:${Math.min(video.width - width, Math.floor(video.width * crop.x))}:${Math.min(video.height - height, Math.floor(video.height * crop.y))}:exact=1,` : ''
        const filter = `${cropFilter}scale=${Math.max(1, Math.round(width * resize))}:${Math.max(1, Math.round(height * resize))}`
        const seek = ['-ss', String(Math.min(atMs, Math.max(0, durationMs - 100)) / 1000)]
        const frame = ['-i', source, '-frames:v', '1', '-vf', filter, '-q:v', '4', destination]
        await run('ffmpeg', ['-v', 'error', '-y', ...seek, ...frame], signal).catch(async () => {
          // Some FFmpeg builds report an encoder error rather than success
          // when seeking past the final frame. Discard any partial JPEG.
          await rm(destination, { force: true })
        })
        // Sparse captures can end before their container duration. If accurate
        // seeking discards every remaining frame, retain the preceding keyframe.
        if (!existsSync(destination)) await run('ffmpeg', ['-v', 'error', '-y', ...seek, '-noaccurate_seek', ...frame], signal)
        const bytes = await readFile(destination)
        if (bytes.length > 2_097_152) throw new RecordError('record_derivation_too_large', 422)
        const artifact = await saveDerived(recording.id, screen!, key, kind, bytes, { signal, check: checkWrite })
        output.artifacts.push(artifact)
        return artifact.id
      }
      await image(0, 'thumbnail', 'thumbnail')
      for (const event of recording.manifest.events) {
        const artifactId = await image(event.atMs, `frame:${event.id}`, 'keyframe')
        const cropArtifactId = event.crop ? await image(event.atMs, `crop:${event.id}`, 'crop', event.crop) : undefined
        output.keyframes.push({ id: derivedId(recording.id, `keyframe:${event.id}`), eventId: event.id, atMs: event.atMs, artifactId, ...(cropArtifactId ? { cropArtifactId } : {}) })
      }
      return output
    } finally { await rm(directory, { recursive: true, force: true }) }
  },
  async audio(recording, artifacts, signal) {
    const directory = await mkdtemp(join(tmpdir(), 'crrt-audio-'))
    try {
      const artifact = artifacts.find(a => a.kind === 'audio') || artifacts.find(a => a.kind === 'screen')
      if (!artifact) throw new RecordError('record_manifest_missing', 422)
      const captured = await download(artifact, directory, signal)
      const source = join(directory, 'indexed.mkv')
      // Index live WebM before measuring duration, including silent tails.
      await run('ffmpeg', ['-v', 'error', '-y', '-protocol_whitelist', 'file', '-f', 'matroska', '-i', captured, '-map', '0', '-c', 'copy', '-f', 'matroska', source], signal)
      const metadata = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source], signal))
      if (!metadata.streams.some((s: any) => s.codec_type === 'audio')) return null
      const durationMs = Number(metadata.format?.duration) * 1000
      const remainingMs = recording.duration_ms! - artifact.offset_ms
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > remainingMs + 2000) throw new RecordError('record_audio_duration_mismatch', 422)
      const destination = join(directory, 'narration.webm')
      await run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k', destination], signal)
      const bytes = await readFile(destination)
      if (bytes.length > 33_554_432) throw new RecordError('record_audio_too_large', 422)
      return bytes
    } finally { await rm(directory, { recursive: true, force: true }) }
  },
}
