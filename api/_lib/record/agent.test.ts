import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ account: vi.fn(), entitlement: vi.fn(), access: vi.fn(), owned: vi.fn(), from: vi.fn(), rpc: vi.fn(), signed: vi.fn() }))
vi.mock('../billing/store.js', () => ({ getAccount: m.account }))
vi.mock('../billing/agent-entitlement.js', () => ({ hasAgentEntitlement: m.entitlement, resolveWidgetAgentAccess: m.access, eligibleAgentPriceIds: () => ['price_local'] }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), database: () => ({ from: m.from, storage: { from: () => ({ createSignedUrl: m.signed }) } }), owned: m.owned, rpc: m.rpc }))
vi.mock('./storage.js', () => ({ artifacts: async () => [{ id: 'image', kind: 'keyframe', mime: 'image/jpeg', sha256: 'hash', path: 'private' }, { id: 'video', kind: 'screen' }], checkPath: vi.fn(), RECORD_BUCKET: 'record-media' }))
import { agentPayload, recordAccess, recordCapabilities } from './agent'
const requestKey = '5f8d09ad-af42-4c36-aaf3-4e0f813aa6ba'
const row: any = { id: 'recording', source: 'tab', title: 'Review', state: 'ready', project_key: null, revision: 1 }
function query(data: any) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'maybeSingle', 'order', 'range']) q[method] = () => q
  q.range = (from: number, to: number) => { if (Array.isArray(data)) data = data.slice(from, to + 1); return q }
  return q
}
beforeEach(() => {
  m.owned.mockResolvedValue(row); m.entitlement.mockReturnValue(true); m.access.mockResolvedValue({ state: 'ready' }); m.account.mockResolvedValue({})
  m.from.mockImplementation(table => query(table === 'project_members' ? { role: 'admin', projects: { widget_private: false, feedback_access: 'team' } } : table === 'project_repo_configs' ? { agent_instructions: 'Read AGENTS.md' } : table === 'recording_events' ? [{ data: { atMs: 20 } }] : []))
  m.rpc.mockResolvedValue({})
  m.signed.mockResolvedValue({ data: { signedUrl: 'expiring-private-image' }, error: null })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
it('keeps human capabilities free while reporting paid access and separate usage', async () => {
  expect(await recordCapabilities('owner')).toMatchObject({ humanSharing: true, agent: { allowed: true, reason: null } })
  m.entitlement.mockReturnValue(false)
  expect(await recordCapabilities('owner')).toMatchObject({ humanPlayback: true, agent: { allowed: false, reason: 'record_upgrade_required' } })
  m.account.mockRejectedValue(new Error('billing unavailable'))
  await expect(recordCapabilities('owner')).rejects.toMatchObject({ status: 503 })
})
it('enforces server-side paid and project authorization independently of the frontend', async () => {
  m.entitlement.mockReturnValue(false)
  await expect(agentPayload('owner', 'recording', { requestKey })).rejects.toMatchObject({ status: 402 })
  for (const [state, status] of [['project_access_denied', 403], ['forbidden', 403], ['owner_upgrade_required', 402]]) {
    m.access.mockResolvedValue({ state })
    await expect(recordAccess('owner', { ...row, project_key: 'project' })).rejects.toMatchObject({ status })
  }
  m.access.mockResolvedValue({ state: 'ready' }); await recordAccess('owner', { ...row, project_key: 'project' })
  for (const member of [null, { role: 'admin', projects: null }, { role: 'member', projects: { widget_private: true, feedback_access: 'admins' } }]) {
    m.from.mockReturnValue(query(member))
    await expect(recordAccess('owner', { ...row, project_key: 'project' })).rejects.toMatchObject({ status: 403 })
  }
})
it('builds deterministic payloads with all events and current instructions, then charges idempotently', async () => {
  const first = await agentPayload('owner', 'recording', { requestKey })
  expect(first.sha256).toBe((await agentPayload('owner', 'recording', { requestKey })).sha256)
  expect(first.payload.events).toEqual([{ atMs: 20 }])
  expect(first.payload.project).toBeNull()
  expect(first.payload.artifacts).toHaveLength(1)
  expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1]).toMatchObject({ p_revision: 1, p_project: null })
  expect(first.artifactAccess[0]).toEqual({ id: 'image', url: 'expiring-private-image', expiresInSeconds: 300 })
  vi.stubEnv('CRRT_DEPLOYMENT_MODE', 'cloud')
  await agentPayload('owner', 'recording', { requestKey })
  expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_prices).toEqual(['price_local'])
  m.owned.mockResolvedValue({ ...row, project_key: 'project' })
  expect((await agentPayload('owner', 'recording', { requestKey })).payload.project?.instructions).toBe('Read AGENTS.md')
  m.from.mockImplementation(table => query(table === 'project_members' ? { role: 'admin', projects: { widget_private: false } } : table === 'project_repo_configs' ? null : []))
  expect((await agentPayload('owner', 'recording', { requestKey })).payload.project?.instructions).toBeNull()
  m.from.mockImplementation(table => query(table === 'project_members' ? { role: 'admin', projects: { widget_private: false } } : table === 'project_repo_configs' ? { agent_instructions: '' } : table === 'recording_transcript_segments' ? [] : null))
  expect((await agentPayload('owner', 'recording', { requestKey })).payload.events).toBeUndefined()
})
it('includes late transcript segments and propagates transactional context conflicts', async () => {
  const segments = Array.from({ length: 1001 }, (_, index) => ({ id: `segment-${index}`, start_ms: index * 1000, text: 'Spoken context' }))
  m.from.mockImplementation(table => query(table === 'recording_transcript_segments' ? segments : []))
  expect((await agentPayload('owner', 'recording', { requestKey })).payload.transcript).toEqual(segments)
  // Reads still agree, but the atomic admission detects a later context change.
  m.rpc.mockRejectedValue(new Error('record_conflict'))
  await expect(agentPayload('owner', 'recording', { requestKey })).rejects.toThrow('record_conflict')
})
it('blocks unfinished recordings, concurrent edits and lost project access before releasing output', async () => {
  m.owned.mockResolvedValue({ ...row, state: 'processing' })
  await expect(agentPayload('owner', 'recording', { requestKey })).rejects.toMatchObject({ code: 'record_not_ready' })
  for (const current of [{ ...row, revision: 2 }, { ...row, project_key: 'changed' }]) {
    m.owned.mockResolvedValueOnce(row).mockResolvedValueOnce(current)
    await expect(agentPayload('owner', 'recording', { requestKey })).rejects.toMatchObject({ code: 'record_conflict' })
  }
  m.owned.mockResolvedValue(row); m.signed.mockResolvedValue({ data: null, error: null })
  await expect(agentPayload('owner', 'recording', { requestKey })).rejects.toMatchObject({ code: 'record_unavailable' })
})
