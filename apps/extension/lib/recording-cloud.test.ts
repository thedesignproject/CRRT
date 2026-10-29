import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalRecording } from './recording'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn(), upload: vi.fn(), multipart: vi.fn(), save: vi.fn(), get: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: mocks.auth } } }))
vi.mock('../../../shared/record/client', () => ({ recordRequest: mocks.request }))
vi.mock('./recording-store', () => ({ saveLocalRecording: mocks.save, getLocalRecording: mocks.get }))
vi.mock('./recording-upload', () => ({ uploadRecordingArtifact: mocks.upload }))
vi.mock('./recording-multipart', () => ({ uploadMultipart: mocks.multipart }))
import { ownerRecordRequest, readRecordingPlayback, recordingManifest, recordingToken, syncRecording } from './recording-cloud'
import { recordingManifestBytes } from './recording-manifest'
const local = (): LocalRecording => ({ id: crypto.randomUUID(), title: 'Capture', source: 'tab', status: 'ready', durationMs: 3000, createdAt: '2026-10-30', authorName: 'You', transcript: [], transcriptionStatus: 'processing', screenBlob: new Blob(['video']), cameraBlob: new Blob(['camera']), audioBlob: new Blob(['audio']), hostedTranscription: true, marks: [{ id: crypto.randomUUID(), atMs: 1000, type: 'text', text: 'Note', pinNumber: 1, points: [{ x: 10, y: 50 }], target: { selector: '#save', pageUrl: 'https://page.test/secret?token=private' } }] })
beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue(undefined)
  mocks.auth.mockResolvedValue({ ok: true, data: { accessToken: 'owner-token' } })
  mocks.save.mockResolvedValue(undefined); mocks.upload.mockResolvedValue(undefined)
  mocks.request.mockImplementation(async (_base, path) => {
    if (path === 'recordings') return { recording: { id: crypto.randomUUID(), authorId: 'owner' }, shareId: 'share' }
    if (path.endsWith('/complete')) throw new Error('not uploaded yet')
    return { protocol: 'tus', headers: {} }
  })
})
it('converts percentage geometry and strips private URL queries in a stable manifest', async () => {
  const input = local(), manifest = await recordingManifest(input)
  expect(manifest.events[0]).toMatchObject({ sequence: 0, mark: { points: [{ x: .1, y: .5 }], text: 'Note', pinNumber: 1 }, target: { pageUrl: 'https://page.test/secret' } })
  expect(manifest.artifacts.map(a => [a.kind, a.mime, a.bytes, a.offsetMs])).toEqual([['screen', 'video/webm', 5, 0], ['camera', 'video/webm', 6, 0], ['audio', 'audio/webm', 5, 0]])
  expect(manifest.artifacts[0].sha256).toHaveLength(64)
  const screen = await recordingManifest({ ...input, source: 'screen', cameraBlob: undefined, audioBlob: new Blob(), marks: [{ ...input.marks[0], text: undefined, pinNumber: undefined }] })
  expect(screen.events[0]).not.toHaveProperty('target')
  expect(screen.artifacts).toHaveLength(1)
})
it('normalizes real performance-clock fractions to the integer API timeline', async () => {
  const input = local()
  input.durationMs = 46780.456789
  input.marks[0].atMs = 37780.987654
  const manifest = await recordingManifest(input)
  expect(manifest.durationMs).toBe(46780)
  expect(manifest.events[0].atMs).toBe(37781)
})
it('shortens imported generated titles before creation without changing the complete note', async () => {
  const input = local(); input.title = 'n'.repeat(2000); input.marks[0].text = input.title
  mocks.request.mockImplementation(async (_base, path, _token, body) => {
    if (path === 'recordings') {
      expect(body.title).toBe('n'.repeat(240))
      return { recording: { id: 'server', authorId: 'owner' }, shareId: 'share' }
    }
    return {}
  })
  const result = await syncRecording(input, vi.fn())
  expect(result.title).toHaveLength(240)
  expect(result.cloud!.manifest.events[0].mark!.text).toHaveLength(2000)
})
it('repairs an oversized staged manifest before retrying finalization and preserves every uploaded artifact ID', async () => {
  const input = local(), manifest = await recordingManifest(input)
  manifest.events = Array.from({ length: 50 }, (_, sequence) => ({ id: crypto.randomUUID(), sequence, atMs: sequence, kind: 'mark', mark: { type: 'draw', points: Array.from({ length: 2048 }, (_, i) => ({ x: i / 2049, y: (i % 19) / 19 })) } }))
  expect(recordingManifestBytes(manifest)).toBeGreaterThan(1_048_576)
  const ids = manifest.artifacts.map(a => a.id)
  input.cloud = { id: 'server', authorId: 'owner', shareId: 'share', manifest, uploads: Object.fromEntries(ids.map(id => [id, { complete: true }])) }
  mocks.request.mockImplementation(async (_base, path, _token, body) => {
    if (path.endsWith('/finalize')) expect(recordingManifestBytes(body)).toBeLessThan(1_048_576)
    return {}
  })
  const result = await syncRecording(input, vi.fn())
  expect(result.cloud!.finalized).toBe(true)
  expect(result.cloud!.manifest.artifacts.map(a => a.id)).toEqual(ids)
  expect(mocks.upload).not.toHaveBeenCalled()
})
it('does not rewrite a large previously accepted manifest when retrying a lost finalization response', async () => {
  const input = local(), manifest = await recordingManifest(input)
  manifest.events = Array.from({ length: 420 }, (_, sequence) => ({ id: crypto.randomUUID(), sequence, atMs: sequence, kind: 'mark', mark: { type: 'text', text: 'x'.repeat(2000), points: [{ x: .5, y: .5 }] } }))
  expect(recordingManifestBytes(manifest)).toBeGreaterThan(900_000)
  expect(recordingManifestBytes(manifest)).toBeLessThanOrEqual(1_048_576)
  const original = JSON.stringify(manifest)
  input.cloud = { id: 'server', authorId: 'owner', shareId: 'share', manifest, uploads: Object.fromEntries(manifest.artifacts.map(a => [a.id, { complete: true }])) }
  mocks.request.mockResolvedValue({})
  await syncRecording(input, vi.fn())
  expect(JSON.stringify(mocks.request.mock.calls.find(call => call[1].endsWith('/finalize'))![3])).toBe(original)
})
it('resamples long persisted strokes into uploadable geometry while preserving their endpoints and local copy', async () => {
  const input = local()
  input.marks[0].points = Array.from({ length: 10000 }, (_, i) => ({ x: i / 100, y: 50 }))
  const manifest = await recordingManifest(input)
  const points = manifest.events[0].mark!.points
  expect(points).toHaveLength(2048)
  expect(points[0]).toEqual({ x: 0, y: .5 })
  expect(points[points.length - 1].x).toBeCloseTo(.9999)
  expect(points[points.length - 1].y).toBe(.5)
  expect(input.marks[0].points).toHaveLength(10000)
})
it('uploads persisted edge-crossing drawings with bounded coordinates without changing local marks', async () => {
  const input = local()
  input.marks[0].points = [{ x: -30, y: 120 }, { x: 150, y: -10 }]
  const manifest = await recordingManifest(input)
  expect(manifest.events[0].mark!.points).toEqual([{ x: 0, y: 1 }, { x: 1, y: 0 }])
  expect(input.marks[0].points[0]).toEqual({ x: -30, y: 120 })
  mocks.request.mockImplementation(async (_base, path) => path === 'recordings' ? { recording: { id: crypto.randomUUID(), authorId: 'owner' }, shareId: 'share' } : {})
  await expect(syncRecording(input, vi.fn())).resolves.toMatchObject({ cloud: { finalized: true } })
})
it.each([null, { ok: false }, { ok: true }, { ok: true, data: {} }])('requires a real session: %j', async response => {
  mocks.auth.mockResolvedValue(response)
  await expect(recordingToken()).rejects.toThrow('Sign in')
  await expect(syncRecording(local(), vi.fn())).rejects.toThrow('Sign in')
  expect(mocks.request).not.toHaveBeenCalled()
})
it('passes authenticated owner requests and playback to the shared client', async () => {
  await ownerRecordRequest('recordings/id', { title: 'Edit' }, 'PATCH')
  expect(mocks.request).toHaveBeenLastCalledWith(undefined, 'recordings/id', 'owner-token', { title: 'Edit' }, 'PATCH')
  await readRecordingPlayback('id')
  expect(mocks.request).toHaveBeenLastCalledWith(undefined, 'recordings/id/playback', 'owner-token', undefined, undefined)
})
it('persists create/share and upload checkpoints before idempotent finalization', async () => {
  const input = local(), changed = vi.fn()
  const completed = new Set<string>()
  mocks.request.mockImplementation(async (_base, path, _token, body) => {
    if (path === 'recordings') return { recording: { id: 'server-id', authorId: 'owner' }, shareId: 'share' }
    if (path.endsWith('/complete') && !completed.has(body.artifactId)) throw new Error('incomplete')
    return { headers: {} }
  })
  mocks.upload.mockImplementation(async (_blob, _auth, _checkpoint, persist) => {
    const artifact = mocks.request.mock.calls[mocks.request.mock.calls.length - 1][3]
    completed.add(artifact.id)
    await persist()
  })
  const first = syncRecording(input, changed)
  expect(syncRecording(input, changed)).toBe(first)
  const result = await first
  expect(result.cloud).toMatchObject({ id: 'server-id', shareId: 'share', finalized: true })
  expect(mocks.upload).toHaveBeenCalledTimes(3)
  expect(changed.mock.calls[0][0].cloud.shareId).toBe('share')
  expect(mocks.request).toHaveBeenCalledWith(undefined, 'recordings', 'owner-token', expect.objectContaining({ clientKey: input.id, consent: { policyVersion: 'record-v1', hostedTranscription: true, provider: 'deepgram', language: 'multi' } }))
  expect(mocks.request).toHaveBeenCalledWith(undefined, 'recordings/server-id/finalize', 'owner-token', result.cloud!.manifest)
  mocks.request.mockClear(); mocks.upload.mockClear(); mocks.get.mockResolvedValue(result)
  await syncRecording(input, vi.fn())
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledTimes(1) // ownership rechecked even for completed local records
})
it('recovers a completed object after losing its completion response', async () => {
  const input = local(), manifest = await recordingManifest(input)
  input.cloud = { id: 'server', authorId: 'owner', shareId: null, manifest, uploads: { [manifest.artifacts[0].id]: { complete: true } } }
  mocks.request.mockResolvedValue({})
  await syncRecording(input, vi.fn())
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.request.mock.calls.filter(call => call[1].endsWith('/complete'))).toHaveLength(2)
})
it('keeps declarations unchanged and preserves media when upload fails', async () => {
  const input = local(), manifest = await recordingManifest(input)
  input.cloud = { id: 'server', authorId: 'owner', shareId: 'share', manifest, uploads: {} }
  mocks.upload.mockRejectedValue(new Error('offline'))
  await expect(syncRecording(input, vi.fn())).rejects.toThrow('offline')
  expect(input.screenBlob!.size).toBe(5)
  const declaration = mocks.request.mock.calls.find(call => call[1].endsWith('/uploads'))![3]
  expect(declaration).toEqual(manifest.artifacts[0])
  expect(mocks.request.mock.calls.some(call => call[1].endsWith('/finalize'))).toBe(false)
  mocks.upload.mockResolvedValue(undefined); mocks.request.mockResolvedValue({})
  await syncRecording(input, vi.fn())
})
it('reports unavailable local bytes and serializes windows using Web Locks', async () => {
  const input = local(), manifest = await recordingManifest(input)
  input.cloud = { id: 'server', authorId: 'owner', shareId: null, manifest, uploads: {} }
  input.screenBlob = undefined
  const request = vi.fn(async (_key, run) => run())
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  try {
    await expect(syncRecording(input, vi.fn())).rejects.toThrow('local media')
    expect(request).toHaveBeenCalledOnce()
  } finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }) }
})
it('defaults old captures to no hosted transcription consent', async () => {
  const input = local(); delete input.hostedTranscription
  mocks.request.mockImplementation(async (_base, path) => path === 'recordings' ? { recording: { id: 'server', authorId: 'owner' }, shareId: null } : {})
  await syncRecording(input, vi.fn())
  expect(mocks.request.mock.calls[0][3].consent.hostedTranscription).toBe(false)
})

it('uses the multipart transport and authenticated per-part signer for R2', async () => {
  const input = local(); input.cameraBlob = undefined; input.audioBlob = undefined
  let complete = false
  mocks.request.mockImplementation(async (_base, path) => {
    if (path === 'recordings') return { recording: { id: 'server', authorId: 'owner' }, shareId: 'share' }
    if (path.endsWith('/complete') && !complete) throw new Error('not uploaded')
    return { protocol: 's3-multipart', uploadId: 'upload', artifactId: 'artifact' }
  })
  mocks.multipart.mockImplementation(async (_blob, _authorization, sign) => { await sign({ artifactId: 'artifact', uploadId: 'upload', partNumber: 1 }); complete = true })
  expect((await syncRecording(input, vi.fn())).cloud!.finalized).toBe(true)
  expect(mocks.request).toHaveBeenCalledWith(undefined, 'recordings/server/upload-parts', 'owner-token', { artifactId: 'artifact', uploadId: 'upload', partNumber: 1 })
  expect(mocks.upload).not.toHaveBeenCalled()
})
