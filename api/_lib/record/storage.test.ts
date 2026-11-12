import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ owned: vi.fn(), command: vi.fn(), from: vi.fn(), signed: vi.fn(), info: vi.fn(), list: vi.fn(), remove: vi.fn() }))
const r2 = vi.hoisted(() => ({ authorize: vi.fn(), complete: vi.fn(), abort: vi.fn() }))
vi.mock('./multipart.js', () => ({ authorizeMultipart: r2.authorize, completeMultipart: r2.complete }))
vi.mock('./r2.js', () => ({ r2Storage: () => ({ abort: r2.abort, list: m.list, remove: m.remove }) }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), owned: m.owned, command: m.command,
  database: () => ({ from: m.from, storage: { from: () => ({ createSignedUploadUrl: m.signed, info: m.info, list: m.list, remove: m.remove }) } }) }))
import { artifacts, authorizeUpload, checkPath, cleanupObjects, completeArtifact, deleteRecording, finalizeRecording, sourcePath } from './storage'
const actor = '551321a6-b904-46cd-a042-bfae5ab5596b', id = '3a7b7b7a-f8b3-4e5d-8c29-e0cdb20ed51f', artifactId = 'f67fb1dd-c62d-4c86-b535-2f26c614e357'
const declaration = { id: artifactId, kind: 'screen', mime: 'video/webm', bytes: 20, sha256: 'a'.repeat(64), offsetMs: 0 }
const artifact = { ...declaration, recording_id: id, path: `${actor}/${id}/${artifactId}.webm`, offset_ms: 0 }
const manifest = { version: 'record.v1', durationMs: 100, artifacts: [declaration], events: [] }
function query(data: any) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'order', 'update', 'maybeSingle', 'range']) q[method] = () => q
  q.range = (from: number, to: number) => { if (Array.isArray(data)) data = data.slice(from, to + 1); return q }
  return q
}
beforeEach(() => {
  m.owned.mockResolvedValue({ id, source: 'tab' }); m.command.mockResolvedValue({ id, state: 'processing', revision: 1 })
  m.from.mockImplementation(table => query(table === 'recordings' ? { storage_prefix: `${actor}/${id}` } : [artifact]))
  m.info.mockResolvedValue({ data: { size: 20, contentType: 'video/webm' }, error: null })
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321')
})
it('reads every artifact in a recording with 1004 objects', async () => {
  const rows = Array.from({ length: 1004 }, (_, index) => ({ ...artifact, id: String(index) }))
  m.from.mockImplementation(() => query(rows))
  expect(await artifacts(id)).toEqual(rows)
  expect(m.from).toHaveBeenCalledTimes(3)
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
it('authorizes immutable, artifact-scoped TUS uploads after durable quota reservation', async () => {
  m.signed.mockResolvedValue({ data: { token: 'scoped' }, error: null })
  expect(await authorizeUpload(actor, id, declaration)).toMatchObject({ protocol: 'tus', headers: { 'x-signature': 'scoped' }, path: artifact.path, upsert: false })
  expect(sourcePath(actor, id, declaration)).toBe(artifact.path)
  m.owned.mockResolvedValueOnce({ id }).mockRejectedValueOnce(new Error('deleted during signing'))
  await expect(authorizeUpload(actor, id, declaration)).rejects.toThrow('deleted during signing')
  m.signed.mockResolvedValue({ data: null, error: null })
  await expect(authorizeUpload(actor, id, declaration)).rejects.toMatchObject({ status: 503 })
  expect(() => checkPath(id, 'feedback-images/other')).toThrow('record_artifact_scope')
})
it('verifies storage completion without proxying bytes and reports retryable incomplete uploads', async () => {
  expect(await completeArtifact(actor, id, artifactId)).toEqual({ artifactId, complete: true })
  await expect(completeArtifact(actor, id, actor)).rejects.toMatchObject({ status: 404 })
  m.info.mockResolvedValue({ data: null, error: { message: 'not found' } })
  await expect(completeArtifact(actor, id, artifactId)).rejects.toMatchObject({ code: 'record_upload_incomplete', retryable: true })
  for (const data of [{ size: 21, contentType: 'video/webm' }, { contentType: 'video/webm' }, { size: 20, contentType: 'audio/webm' }]) {
    m.info.mockResolvedValue({ data, error: null })
    await expect(completeArtifact(actor, id, artifactId)).rejects.toMatchObject({ code: 'record_artifact_mismatch' })
  }
})
it('finalizes the exact declared manifest and rejects DOM targets from non-tab captures', async () => {
  expect(await finalizeRecording(actor, id, manifest)).toMatchObject({ state: 'processing' })
  m.from.mockReturnValue(query([artifact, { ...artifact, kind: 'camera', id: actor }]))
  await expect(finalizeRecording(actor, id, manifest)).rejects.toMatchObject({ status: 409 })
  m.from.mockReturnValue(query([artifact]))
  m.owned.mockResolvedValue({ id, source: 'window' })
  const event = { id: actor, sequence: 0, kind: 'click', atMs: 10, target: { selector: '#button' } }
  await expect(finalizeRecording(actor, id, { ...manifest, events: [event] })).rejects.toMatchObject({ status: 400 })
  expect(await finalizeRecording(actor, id, manifest)).toMatchObject({ id })
})
it('deletes idempotently without exposing cross-owner existence', async () => {
  m.from.mockReturnValue(query(null))
  await expect(deleteRecording(actor, id)).rejects.toMatchObject({ status: 404 })
  m.from.mockReturnValue(query({ deleted_at: null }))
  expect(await deleteRecording(actor, id)).toMatchObject({ deleted: true })
  m.from.mockReturnValue(query({ deleted_at: 'now' }))
  await deleteRecording(actor, id)
  expect(m.command).toHaveBeenCalledTimes(1)
})
it('cleans private objects in bounded batches including uncommitted derived artifacts', async () => {
  m.list.mockResolvedValueOnce({ data: [{ name: `${artifactId}.webm` }], error: null }).mockResolvedValue({ data: [], error: null })
  m.remove.mockResolvedValue({ data: [], error: null })
  await cleanupObjects(id)
  expect(m.remove).toHaveBeenCalledWith([artifact.path])
  m.from.mockReturnValue(query(null))
  await expect(cleanupObjects(id)).rejects.toMatchObject({ status: 404 })
  // Prefix survives after every artifact row has already been removed.
  m.from.mockReturnValue(query({ storage_prefix: `${actor}/${id}` }))
  m.list.mockResolvedValue({ data: null, error: null })
  await expect(cleanupObjects(id)).rejects.toMatchObject({ status: 503 })
  m.list.mockResolvedValue({ data: [{ name: `${artifactId}.webm` }], error: null })
  await expect(cleanupObjects(id)).rejects.toMatchObject({ code: 'record_cleanup_pending' })
})
it('routes R2 uploads, completion and multipart cleanup through the recording provider', async () => {
  const recording = { id, storage_provider: 'r2', storage_bucket: 'record-test', storage_prefix: `${actor}/${id}` }
  m.owned.mockResolvedValue(recording)
  r2.authorize.mockResolvedValue({ protocol: 's3-multipart' })
  expect(await authorizeUpload(actor, id, declaration)).toEqual({ protocol: 's3-multipart' })
  expect(r2.authorize).toHaveBeenCalledWith(actor, recording, artifactId)
  r2.complete.mockResolvedValue({ data: { size: 20, contentType: 'video/webm' }, error: null })
  expect(await completeArtifact(actor, id, artifactId)).toEqual({ artifactId, complete: true })
  m.from.mockImplementation(table => query(table === 'recordings' ? recording : [{ ...artifact, multipart_id: 'upload' }, { ...artifact, multipart_id: null }]))
  m.list.mockResolvedValue({ data: [], error: null })
  await cleanupObjects(id)
  expect(r2.abort).toHaveBeenCalledWith(artifact.path, 'upload')
})
