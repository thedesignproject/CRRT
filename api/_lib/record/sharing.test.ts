import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ from: vi.fn(), signed: vi.fn(), owned: vi.fn(), command: vi.fn(), artifacts: vi.fn() }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), database: () => ({ from: m.from, storage: { from: () => ({ createSignedUrl: m.signed }) } }), owned: m.owned, command: m.command }))
vi.mock('./storage.js', async original => ({ ...await original<typeof import('./storage')>(), artifacts: m.artifacts }))
import { changeShare, ownerPlayback, ownerShare, playback, readShare } from './sharing'
import { digest, initialShare } from './core'
const id = 'bfb7c936-0546-4314-87b4-a60113c6c030', owner = 'd775b075-6cc7-4d8f-b922-2eea57c9fbb5'
const row: any = { id, project_key: 'private-project', title: 'Review', state: 'processing' }
function query(data: any) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'is', 'maybeSingle', 'order', 'range']) q[method] = () => q
  q.update = (value: object) => { Object.assign(row, value); return q }
  q.range = (from: number, to: number) => { if (Array.isArray(data)) data = data.slice(from, to + 1); return q }
  return q
}
beforeEach(() => {
  vi.stubEnv('SHARE_TOKEN_SECRET', 'local-share-test-secret-long-enough')
  row.client_key = owner; row.revision = 1; row.share_hash = digest(initialShare(id, owner))
  m.from.mockImplementation(table => query(table === 'recordings' ? row : [])); m.owned.mockResolvedValue(row)
  m.artifacts.mockResolvedValue([{ id, kind: 'screen', path: `${owner}/${id}/${id}.webm` }])
  m.signed.mockResolvedValue({ data: { signedUrl: 'private-signed-url' }, error: null })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
it('reuses the current link, revokes it, and creates a fresh stable generation on re-enable', async () => {
  const initial = (await ownerShare(owner, id)).shareId
  expect(initial).toHaveLength(43)
  expect((await changeShare(owner, id, false)).shareId).toBe(initial)
  expect(await changeShare(owner, id, true)).toMatchObject({ shareId: null, revoked: true })
  const revokedHash = row.share_hash
  await changeShare(owner, id, true)
  expect(row.share_hash).toBe(revokedHash)
  const enabled = await changeShare(owner, id, false)
  expect(enabled.shareId).toMatch(/^v1\./)
  expect(enabled.shareId).not.toBe(initial)
  expect(await ownerShare(owner, id)).toEqual(enabled)
  expect(await changeShare(owner, id, false)).toEqual(enabled)
  expect((await readShare(enabled.shareId)).recording.id).toBe(id)
})
it('rejects forged, cross-recording, revoked, or obsolete generation capabilities', async () => {
  row.share_hash = 'generation-one'
  const first = (await ownerShare(owner, id)).shareId!
  await expect(readShare(`${first.slice(0, -1)}!`)).rejects.toMatchObject({ status: 400 })
  const forged = first.slice(0, -1) + (first.endsWith('A') ? 'B' : 'A')
  await expect(readShare(forged)).rejects.toMatchObject({ status: 404 })
  await expect(readShare(first.replace(id, owner))).rejects.toMatchObject({ status: 404 })
  row.share_hash = 'generation-two'
  await expect(readShare(first)).rejects.toMatchObject({ status: 404 })
  row.share_hash = 'revoked:generation-three'
  await expect(readShare(first)).rejects.toMatchObject({ status: 404 })
  row.share_hash = digest(initialShare(id, owner))
  await expect(readShare(first)).rejects.toMatchObject({ status: 404 })
})
it('does not report success when a competing change wins the generation compare-and-swap', async () => {
  m.from.mockImplementation(() => { const q = query(row); q.update = () => q; return q })
  await expect(changeShare(owner, id, true)).rejects.toMatchObject({ status: 409 })
  m.owned.mockRejectedValueOnce(new Error('Denied'))
  await expect(ownerShare(owner, id)).rejects.toThrow('Denied')
})
it('serves early processing states without publishing unverified source media or project context', async () => {
  const result = await readShare('a'.repeat(43))
  expect(result.artifacts).toEqual([])
  expect(result.recording).not.toHaveProperty('projectKey')
  expect(m.signed).not.toHaveBeenCalled()
  expect((await ownerPlayback(owner, id)).recording.id).toBe(id)
  m.from.mockImplementation(table => query(table === 'recordings' ? row : table === 'recording_transcript_segments' ? [] : null))
  expect((await playback(row)).artifacts).toEqual([])
})
it('returns expiring private playback artifacts only after the metadata stage succeeds', async () => {
  m.from.mockImplementation(table => query(table === 'recording_jobs' ? [{ stage: 'transcription', state: 'failed' }, { stage: 'metadata', state: 'done' }] : table === 'recording_events' ? [{ data: { atMs: 100 } }] : []))
  const result = await playback(row)
  expect(result.artifacts[0]).toMatchObject({ url: 'private-signed-url', expiresInSeconds: 300 })
  expect(result.events).toEqual([{ atMs: 100 }])
  m.signed.mockResolvedValue({ data: null, error: null })
  await expect(playback(row)).rejects.toMatchObject({ status: 503 })
})
it('fails closed for malformed tokens, missing recordings and mid-response revocation', async () => {
  await expect(readShare('bad')).rejects.toMatchObject({ status: 400 })
  m.from.mockReturnValue(query(null))
  await expect(readShare('a'.repeat(43))).rejects.toMatchObject({ status: 404 })
  m.from.mockImplementation(table => query(table === 'recordings' ? null : [])).mockReturnValueOnce(query(row))
  await expect(readShare('a'.repeat(43))).rejects.toMatchObject({ status: 404 })
})
it('returns all transcript segments beyond the REST row limit', async () => {
  const segments = Array.from({ length: 1001 }, (_, index) => ({ id: `segment-${index}`, start_ms: index * 1000, text: 'Spoken context' }))
  m.from.mockImplementation(table => query(table === 'recording_transcript_segments' ? segments : []))
  expect((await playback(row)).transcript).toEqual(segments)
})
