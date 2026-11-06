import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ owned: vi.fn(), query: vi.fn(), create: vi.fn(), parts: vi.fn(), abort: vi.fn(), part: vi.fn(), inspect: vi.fn(), complete: vi.fn() }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), owned: m.owned, database: () => ({ from: m.query }) }))
vi.mock('./r2.js', () => ({ PART_BYTES: 8 * 1024 * 1024, UPLOAD_SECONDS: 900, r2Storage: () => m }))
import { authorizeMultipart, authorizePart, completeMultipart } from './multipart'
const id = '3a7b7b7a-f8b3-4e5d-8c29-e0cdb20ed51f', aid = 'f67fb1dd-c62d-4c86-b535-2f26c614e357', owner = '551321a6-b904-46cd-a042-bfae5ab5596b'
const recording: any = { id, storage_provider: 'r2', storage_bucket: 'record-test', manifest_hash: null }
let row: any, saved: any
const input = { artifactId: aid, uploadId: 'existing', partNumber: 1 }
function query(data: () => unknown) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data: data(), error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'is', 'maybeSingle']) q[method] = vi.fn(() => q)
  return q
}
beforeEach(() => {
  vi.clearAllMocks()
  row = { id: aid, recording_id: id, path: `${owner}/${id}/${aid}.webm`, bytes: 10, mime: 'video/webm', verified_at: null, multipart_id: null }
  saved = [{ id: aid }]
  m.owned.mockResolvedValue(recording); m.create.mockResolvedValue('new'); m.parts.mockResolvedValue([]); m.abort.mockResolvedValue(undefined); m.inspect.mockResolvedValue({ data: null, error: { message: 'not found' } }); m.part.mockResolvedValue('https://r2.test/part'); m.complete.mockResolvedValue(undefined)
  m.query.mockImplementation(() => ({ ...query(() => row), update: () => query(() => saved) }))
})
it('creates a durable multipart session and rechecks owner access before returning it', async () => {
  expect(await authorizeMultipart(owner, recording, aid)).toMatchObject({ protocol: 's3-multipart', uploadId: 'new', partSize: 8388608, uploadedParts: [] })
  expect(m.create).toHaveBeenCalledWith(row.path, 'video/webm'); expect(m.owned).toHaveBeenCalledWith(owner, id)
})
it('resumes the same upload and exposes storage-authoritative completed parts', async () => {
  row.multipart_id = 'existing'; m.parts.mockResolvedValue([{ PartNumber: 1, Size: 10, ETag: 'etag' }])
  expect(await authorizeMultipart(owner, recording, aid)).toMatchObject({ uploadId: 'existing', uploadedParts: [{ number: 1, bytes: 10, etag: 'etag' }] })
  expect(m.create).not.toHaveBeenCalled()
})
it('replaces expired sessions but preserves storage outage failures', async () => {
  row.multipart_id = 'existing'; m.parts.mockRejectedValueOnce({ name: 'NoSuchUpload' })
  expect((await authorizeMultipart(owner, recording, aid)).uploadId).toBe('new')
  m.parts.mockRejectedValueOnce(new Error('offline'))
  await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('offline')
})
it('never starts a replacement session over a completed private object', async () => {
  row.multipart_id = 'existing'; m.parts.mockRejectedValueOnce({ name: 'NoSuchUpload' })
  m.inspect.mockResolvedValue({ data: { size: 10 }, error: null })
  await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('record_conflict')
  expect(m.create).not.toHaveBeenCalled()
})
it('aborts a losing concurrent initialization and an initialization whose database write fails', async () => {
  saved = []
  await expect(authorizeMultipart(owner, recording, aid)).rejects.toMatchObject({ code: 'record_conflict', retryable: true })
  expect(m.abort).toHaveBeenCalledWith(row.path, 'new')
  m.query.mockImplementation(() => ({ ...query(() => row), update: () => { const q = query(() => null); q.then = (resolve: any) => Promise.resolve({ data: null, error: { message: 'database offline' } }).then(resolve); return q } }))
  await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('record_unavailable')
  expect(m.abort).toHaveBeenCalledTimes(2)
})
it('rejects missing, completed and out-of-scope artifacts', async () => {
  row.verified_at = 'now'; await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('record_conflict')
  row.path = 'other/recording/video.webm'; await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('record_artifact_scope')
  row = null; await expect(authorizeMultipart(owner, recording, aid)).rejects.toThrow('record_not_found')
})
it('signs only a declared part and length after owner authorization', async () => {
  row.multipart_id = 'existing'
  expect(await authorizePart(owner, id, input)).toEqual({ url: 'https://r2.test/part', bytes: 10, expiresInSeconds: 900 })
  expect(m.part).toHaveBeenCalledWith(row.path, 'existing', 1, 10)
  row.bytes = 8388609
  expect((await authorizePart(owner, id, { ...input, partNumber: 2 })).bytes).toBe(1)
})
it('fails closed for finalized recordings, another provider, mismatched sessions and invalid part numbers', async () => {
  m.owned.mockResolvedValueOnce({ ...recording, storage_provider: 'supabase' })
  await expect(authorizePart(owner, id, input)).rejects.toThrow('record_conflict')
  m.owned.mockResolvedValueOnce({ ...recording, manifest_hash: 'done' })
  await expect(authorizePart(owner, id, input)).rejects.toThrow('record_conflict')
  await expect(authorizePart(owner, id, input)).rejects.toThrow('record_conflict')
  row.multipart_id = 'existing'; row.verified_at = 'now'; await expect(authorizePart(owner, id, input)).rejects.toThrow('record_conflict')
  row.verified_at = null; await expect(authorizePart(owner, id, { ...input, partNumber: 2 })).rejects.toThrow('record_invalid')
  await expect(authorizePart(owner, id, { ...input, partNumber: 129 })).rejects.toThrow('record_invalid')
  expect(m.part).not.toHaveBeenCalled()
})
it('completes only the exact ordered parts and recovers a lost completion response', async () => {
  row.multipart_id = 'existing'; m.parts.mockResolvedValue([{ PartNumber: 1, Size: 10, ETag: 'etag' }])
  const ready = { data: { size: 10, contentType: 'video/webm' }, error: null }
  m.inspect.mockResolvedValueOnce({ data: null, error: { message: 'missing' } }).mockResolvedValue(ready)
  expect(await completeMultipart(recording, row)).toEqual(ready)
  expect(m.complete).toHaveBeenCalledWith(row.path, 'existing', [{ PartNumber: 1, ETag: 'etag' }])
  await completeMultipart(recording, row); expect(m.complete).toHaveBeenCalledOnce()
})
it.each([[], [{ PartNumber: 2, Size: 10, ETag: 'e' }], [{ PartNumber: 1, Size: 10 }], [{ PartNumber: 1, Size: 11, ETag: 'e' }]].map(parts => [parts]))('rejects incomplete or altered parts: %j', async parts => {
  row.multipart_id = 'existing'; m.parts.mockResolvedValue(parts)
  await expect(completeMultipart(recording, row)).rejects.toThrow('record_upload_incomplete')
  expect(m.complete).not.toHaveBeenCalled()
})
it('does not attempt completion without a stored upload session', async () => {
  await expect(completeMultipart(recording, row)).rejects.toThrow('record_upload_incomplete')
})
