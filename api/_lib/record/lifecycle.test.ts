import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), query: vi.fn(), result: { data: null as any, error: null as any } }))
vi.mock('../supabase.js', () => ({ getServiceSupabase: () => ({ rpc: mocks.rpc, from: mocks.query }) }))
import { attachRecording, createRecording, listRecordings, readRecording, updateRecording } from './lifecycle'
import { allPages, canonical, checked, digest, initialShare, limit, owned, parse, RecordError, summary } from './core'
import { uuid } from './contracts'

const actor = randomUUID(), id = randomUUID(), clientKey = randomUUID()
const input = { clientKey, title: 'Review', source: 'tab', consent: { hostedTranscription: false, policyVersion: 'record-v1', provider: 'deepgram', language: 'multi' } }
const row = { id, client_key: clientKey, title: 'Review', source: 'tab', state: 'recording', project_key: null, duration_ms: null, failure: null, created_at: '2026-01-01', updated_at: '2026-01-01', revision: 0 }
function result(data: unknown, error: unknown = null) {
  const query: any = { then: (resolve: any) => Promise.resolve({ data, error }).then(resolve) }
  for (const name of ['select', 'eq', 'is', 'order', 'limit', 'or', 'maybeSingle']) query[name] = vi.fn(() => query)
  mocks.query.mockReturnValue(query)
  return query
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
describe('Record lifecycle', () => {
  it('creates and retries the same personal recording without a project', async () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', 'test-secret-with-more-than-24-characters')
    mocks.rpc.mockImplementation(async (_name, args) => ({ data: { ...row, share_hash: digest(initialShare(id, clientKey)) }, error: null }))
    const created = await createRecording(actor, input)
    expect(created.shareId).toBe(initialShare(id, clientKey))
    expect(created.recording.projectKey).toBeNull()
    mocks.rpc.mockResolvedValue({ data: { ...row, share_hash: 'rotated' }, error: null })
    expect((await createRecording(actor, input)).shareId).toBeNull()
    expect(mocks.rpc.mock.calls[0][1].p_input.requestHash).toBe(digest(canonical(input)))
  })
  it('reads and pages only the owner library', async () => {
    result(row)
    expect((await readRecording(actor, id)).recording.id).toBe(id)
    result([row])
    expect((await listRecordings(actor, {})).next).toBeNull()
    result(Array.from({ length: 51 }, () => row))
    expect((await listRecordings(actor, {})).next).toBe(id)
    const cursorQuery = result(row)
    const pageQuery = result([])
    mocks.query.mockReturnValueOnce(cursorQuery).mockReturnValueOnce(pageQuery)
    expect((await listRecordings(actor, { before: id })).recordings).toEqual([])
    expect(pageQuery.or).toHaveBeenCalled()
    expect(cursorQuery.is).not.toHaveBeenCalled()
    const deletedCursor = result({ ...row, deleted_at: '2026-01-02' })
    mocks.query.mockReturnValueOnce(deletedCursor).mockReturnValueOnce(pageQuery)
    await listRecordings(actor, { before: id })
    result(null)
    await expect(listRecordings(actor, { before: id })).rejects.toMatchObject({ status: 404 })
    result(null)
    await expect(owned(actor, id)).rejects.toMatchObject({ status: 404 })
  })
  it('retrieves every stable page beyond REST limits and rejects invalid page responses', async () => {
    const values = Array.from({ length: 1004 }, (_, id) => ({ id }))
    const fetch = vi.fn(async (from: number, to: number) => ({ data: values.slice(from, to + 1), error: null }))
    expect(await allPages(fetch)).toEqual(values)
    expect(fetch).toHaveBeenLastCalledWith(1000, 1499)
    await expect(allPages(async () => ({ data: null, error: null }))).rejects.toMatchObject({ status: 503 })
  })
  it('updates metadata and checks project attachment while allowing detach', async () => {
    mocks.rpc.mockResolvedValue({ data: row, error: null })
    expect((await updateRecording(actor, id, { title: 'New' })).recording.id).toBe(id)
    for (const member of [null, { role: 'guest' }]) {
      result(member)
      await expect(attachRecording(actor, id, { projectKey: 'project' })).rejects.toMatchObject({ status: 403 })
    }
    result({ role: 'member' })
    await attachRecording(actor, id, { projectKey: 'project' })
    await attachRecording(actor, id, { projectKey: null })
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
  })
  it('fails closed on invalid input, database errors, limits and missing share secrets', () => {
    expect(() => parse(uuid, 'invalid')).toThrow(RecordError)
    expect(parse(uuid, id)).toBe(id)
    expect(parse(uuid, id.toUpperCase())).toBe(id)
    expect(checked({ data: 1, error: null })).toBe(1)
    for (const [code, status] of Object.entries({ record_not_found: 404, record_forbidden: 403, forbidden: 403, record_conflict: 409, record_quota: 429, record_upload_incomplete: 409, record_invalid: 400, 'database details': 503 })) {
      try { checked({ data: null, error: { message: code } }) } catch (error) { expect(error).toMatchObject({ status }) }
    }
    expect(limit('RECORD_TEST_LIMIT', 12)).toBe(12)
    vi.stubEnv('RECORD_TEST_LIMIT', '4')
    expect(limit('RECORD_TEST_LIMIT', 12)).toBe(4)
    vi.stubEnv('RECORD_TEST_LIMIT', '-1')
    expect(() => limit('RECORD_TEST_LIMIT', 12)).toThrow('record_configuration')
    vi.stubEnv('SHARE_TOKEN_SECRET', '')
    expect(() => initialShare(id, clientKey)).toThrow('record_configuration')
    vi.stubEnv('SHARE_TOKEN_SECRET', 'short')
    expect(() => initialShare(id, clientKey)).toThrow('record_configuration')
    expect(canonical({ z: [null, 1], a: { b: 'value' } })).toBe('{"a":{"b":"value"},"z":[null,1]}')
    expect(summary({ ...row, manifest: { events: [{ kind: 'mark' }, { kind: 'click' }] } } as any).markCount).toBe(1)
  })
})
