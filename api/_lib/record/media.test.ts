// Native process orchestration is deterministic here; the Docker integration
// separately decodes real WebM and verifies the produced JPEGs in storage.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { writeFile } from 'node:fs/promises'
const m = vi.hoisted(() => ({ spawn: vi.fn(), signed: vi.fn(), upload: vi.fn(), download: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: m.spawn, default: { spawn: m.spawn } }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), database: () => ({ storage: { from: () => ({ createSignedUrl: m.signed, createSignedUploadUrl: m.signed, download: m.download }) } }) }))
import { derivedId, ffmpegProcessor, saveDerived } from './media'
import { digest, RecordError } from './core'
const id = 'd11856f5-c207-4729-bdcb-91b24eebdb11', actor = 'b449564c-aa90-45cb-ad57-71990a9686e8'
const bytes = new Uint8Array([1, 2, 3]), jpeg = new Uint8Array([4, 5, 6])
const source: any = { id, recording_id: id, kind: 'screen', bytes: 3, sha256: digest(bytes), offset_ms: 0, path: `${actor}/${id}/${id}.webm` }
const row: any = { id, duration_ms: 2000, manifest: { events: [{ id, atMs: 500, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, { id: actor, atMs: 1000 }] } }
const signal = new AbortController().signal
const checkWrite = vi.fn().mockResolvedValue(undefined)
let metadata: any, output: Uint8Array, mode: string
beforeEach(() => {
  metadata = { format: { duration: 2 }, streams: [{ codec_type: 'video', width: 320, height: 240 }, { codec_type: 'audio' }] }
  output = jpeg; mode = 'success'
  m.signed.mockResolvedValue({ data: { signedUrl: 'https://storage.test/private' }, error: null })
  m.upload.mockResolvedValue({ data: {}, error: null })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init) => init?.method === 'PUT' ? new Response(null, { status: (await m.upload()).error ? 409 : 200 }) : new Response(bytes)))
  m.spawn.mockImplementation((binary, args) => {
    const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = { resume: vi.fn() }; child.kill = vi.fn(() => { child.emit('close', 1) })
    queueMicrotask(async () => {
      if (mode === 'error') { child.emit('error', new Error('missing ffmpeg')); return }
      if (mode === 'timeout') return
      if (mode === 'large-stdout') { child.stdout.emit('data', 'x'.repeat(1_000_001)); return }
      if (mode === 'failure') { child.emit('close', 1); return }
      if (mode === 'empty-frame-error' && args.includes('-frames:v') && !args.includes('-noaccurate_seek')) { child.emit('close', 1); return }
      if (binary === 'ffprobe') child.stdout.emit('data', JSON.stringify(metadata))
      else if (mode !== 'empty-frame' || !args.includes('-frames:v') || args.includes('-noaccurate_seek')) await writeFile(args[args.length - 1], output)
      child.emit('close', 0)
    })
    return child
  })
})
it.each(['empty-frame', 'empty-frame-error'])('retains a preceding keyframe for %s and clamps tiny crops to real pixels', async nextMode => {
  mode = nextMode
  const result = await ffmpegProcessor.derive({ ...row, manifest: { events: [{ id, atMs: 2000, crop: { x: 0.999, y: 0.999, width: 0.001, height: 0.001 } }] } }, [source], signal, checkWrite)
  expect(result.artifacts.map(a => a.kind)).toEqual(['thumbnail', 'keyframe', 'crop'])
  expect(m.spawn.mock.calls.some(([, args]) => args.includes('-noaccurate_seek'))).toBe(true)
  expect(m.spawn.mock.calls.some(([, args]) => args.includes('crop=1:1:319:239:exact=1,scale=640:640'))).toBe(true)
})
it.each([
  [{ x: 0.999, y: 0, width: 0.001, height: 1 }, 'crop=1:240:319:0:exact=1,scale=3:640'],
  [{ x: 0, y: 0.999, width: 1, height: 0.001 }, 'crop=320:1:0:239:exact=1,scale=640:2'],
])('bounds both dimensions for a narrow crop %j', async (crop, filter) => {
  const result = await ffmpegProcessor.derive({ ...row, manifest: { events: [{ id, atMs: 500, crop }] } }, [source], signal, checkWrite)
  expect(result.artifacts.map(a => a.kind)).toEqual(['thumbnail', 'keyframe', 'crop'])
  expect(m.spawn.mock.calls.some(([, args]) => args.includes(filter))).toBe(true)
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers() })
it('derives metadata, thumbnail, event frames and normalized crops from immutable source objects', async () => {
  const result = await ffmpegProcessor.derive(row, [source, { ...source, kind: 'camera' }], signal, checkWrite)
  expect(result.metadata).toEqual({ width: 320, height: 240, durationMs: 2000 })
  expect(result.artifacts.map(a => a.kind)).toEqual(['thumbnail', 'keyframe', 'crop', 'keyframe'])
  expect(result.keyframes[0].cropArtifactId).toBeTruthy()
  expect(result.keyframes[1]).not.toHaveProperty('cropArtifactId')
  const frameCommands = m.spawn.mock.calls.filter(([binary, args]) => binary === 'ffmpeg' && args.includes('-frames:v'))
  expect(frameCommands.every(([, args]) => args.indexOf('-ss') < args.indexOf('-i'))).toBe(true)
  expect(m.spawn.mock.calls.some(([, args]) => args.includes('copy') && args.includes('matroska'))).toBe(true)
  expect(derivedId(id, 'thumbnail')).toBe(derivedId(id, 'thumbnail'))
  expect(await ffmpegProcessor.audio(row, [{ ...source, kind: 'audio' }], signal)).toEqual(Buffer.from(jpeg))
  expect(await ffmpegProcessor.audio(row, [source], signal)).toEqual(Buffer.from(jpeg))
  metadata.streams = []
  expect(await ffmpegProcessor.audio(row, [source], signal)).toBeNull()
})
it('fences stale or cancelled writes before and after minting upload tokens', async () => {
  const aborted = new AbortController(); aborted.abort()
  await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal: aborted.signal, check: checkWrite })).rejects.toThrow('record_job_cancelled')
  checkWrite.mockRejectedValueOnce(new RecordError('record_job_cancelled', 409))
  await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal, check: checkWrite })).rejects.toThrow('record_job_cancelled')
  checkWrite.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new RecordError('record_job_cancelled', 409))
  await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal, check: checkWrite })).rejects.toThrow('record_job_cancelled')
  expect(m.upload).not.toHaveBeenCalled()
  m.signed.mockResolvedValueOnce({ data: null, error: null })
  await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal, check: checkWrite })).rejects.toThrow('record_unavailable')
  const during = new AbortController()
  m.upload.mockImplementationOnce(async () => { during.abort(); return { error: null } })
  await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal: during.signal, check: checkWrite })).rejects.toThrow('record_job_cancelled')
})
it('rejects missing manifests, invalid clocks and missing tracks without leaking temporary files', async () => {
  await expect(ffmpegProcessor.derive(row, [], signal, checkWrite)).rejects.toThrow('record_manifest_missing')
  await expect(ffmpegProcessor.derive({ ...row, manifest: null }, [source], signal, checkWrite)).rejects.toThrow('record_manifest_missing')
  await expect(ffmpegProcessor.derive({ ...row, duration_ms: null }, [source], signal, checkWrite)).rejects.toThrow('record_manifest_missing')
  await expect(ffmpegProcessor.audio(row, [], signal)).rejects.toThrow('record_manifest_missing')
  for (const change of [{ format: { duration: 'unknown' } }, { format: { duration: 99 } }, { streams: [] }]) {
    metadata = { format: { duration: 2 }, streams: [{ codec_type: 'video' }], ...change }
    await expect(ffmpegProcessor.derive(row, [source], signal, checkWrite)).rejects.toThrow('record_duration_mismatch')
  }
})
it('fails closed on signed download failures and immutable source size/checksum mismatches', async () => {
  m.signed.mockResolvedValueOnce({ data: null, error: null })
  await expect(ffmpegProcessor.audio(row, [source], signal)).rejects.toThrow('record_unavailable')
  for (const response of [new Response('missing', { status: 404 }), new Response(null)]) {
    vi.mocked(fetch).mockResolvedValueOnce(response)
    await expect(ffmpegProcessor.audio(row, [source], signal)).rejects.toThrow('record_media_download')
  }
  await expect(ffmpegProcessor.audio(row, [{ ...source, bytes: 4 }], signal)).rejects.toThrow('record_artifact_mismatch')
  await expect(ffmpegProcessor.audio(row, [{ ...source, sha256: 'bad' }], signal)).rejects.toThrow('record_artifact_mismatch')
})
it.each([undefined, 'unknown', 0, -1, 3600])('rejects audio duration %s before encoding or provider access', async duration => {
  metadata.format = duration === undefined ? undefined : { duration }
  await expect(ffmpegProcessor.audio(row, [{ ...source, kind: 'audio' }], signal)).rejects.toThrow('record_audio_duration_mismatch')
  expect(m.spawn.mock.calls.some(([, args]) => args.includes('libopus'))).toBe(false)
})
it('bounds audio against its offset, allowing the media clock tolerance', async () => {
  metadata.format.duration = 4
  await expect(ffmpegProcessor.audio(row, [source], signal)).resolves.toEqual(Buffer.from(jpeg))
  await expect(ffmpegProcessor.audio(row, [{ ...source, offset_ms: 500 }], signal)).rejects.toThrow('record_audio_duration_mismatch')
})
it('maps missing/broken/oversized worker processes to bounded safe failures', async () => {
  for (const [nextMode, error] of [['error', 'record_media_worker_unavailable'], ['failure', 'record_media_invalid'], ['large-stdout', 'record_media_invalid']]) {
    mode = nextMode
    await expect(ffmpegProcessor.audio(row, [source], signal)).rejects.toThrow(error)
  }
  mode = 'timeout'; vi.useFakeTimers()
  m.spawn.mockClear()
  const promise = ffmpegProcessor.audio(row, [source], signal)
  const expectation = expect(promise).rejects.toThrow('record_media_invalid')
  // Let the real source-file stream finish before advancing the process timer.
  while (!m.spawn.mock.results.length || m.spawn.mock.results[m.spawn.mock.results.length - 1].value.listenerCount('close') === 0) await vi.advanceTimersByTimeAsync(1)
  await vi.advanceTimersByTimeAsync(120_001)
  await expectation
})
it('bounds derived-image/audio sizes and reuses only byte-identical existing objects', async () => {
  output = new Uint8Array(2_097_153)
  await expect(ffmpegProcessor.derive(row, [source], signal, checkWrite)).rejects.toThrow('record_derivation_too_large')
  output = new Uint8Array(33_554_433)
  await expect(ffmpegProcessor.audio(row, [source], signal)).rejects.toThrow('record_audio_too_large')
  m.upload.mockResolvedValue({ data: null, error: { message: 'already exists' } })
  m.download.mockResolvedValue({ data: new Blob([jpeg]), error: null })
  expect((await saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal, check: checkWrite })).bytes).toBe(3)
  for (const data of [null, new Blob(['different'])]) {
    m.download.mockResolvedValue({ data, error: null })
    await expect(saveDerived(id, source, 'thumbnail', 'thumbnail', jpeg, { signal, check: checkWrite })).rejects.toThrow('record_derivation_conflict')
  }
})
