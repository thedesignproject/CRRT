// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ row: null as unknown, error: null as unknown, ownerAccess: vi.fn(), owned: vi.fn(), recordAccess: vi.fn(), agentArtifactAccess: vi.fn() }))
vi.mock('../../api/_lib/storybook.js', () => ({ ownerAccess: fake.ownerAccess }))
vi.mock('../../api/_lib/record/core.js', () => ({ owned: fake.owned }))
vi.mock('../../api/_lib/record/agent.js', () => ({ recordAccess: fake.recordAccess, agentArtifactAccess: fake.agentArtifactAccess }))
vi.mock('../../api/_lib/supabase.js', () => {
  const q: Record<string, unknown> = {}
  for (const name of ['from','select','eq']) q[name] = vi.fn(() => q)
  q.maybeSingle = async () => ({ data: fake.row, error: fake.error })
  return { getServiceSupabase: () => q }
})
vi.mock('../../api/_lib/record/storage.js', () => ({ artifacts: vi.fn(async () => []) }))
import { recoverDashboardReceipt } from './dashboard-recovery.js'
import type { DashboardOperation } from './dashboard-operations.js'
const actor = { user_id: 'user', email: 'user@test.local', connection_id: 'connection' }
const read = vi.fn()
const recover = (name: string, data: unknown, body = {}, ok = true) => recoverDashboardReceipt({ name } as DashboardOperation, { id: 'record' }, body, actor, { ok, status: ok ? 201 : 403, data }, read)
beforeEach(() => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  vi.clearAllMocks(); fake.error = null; fake.row = { revoked_at: null, claimed_at: null, expires_at: new Date(Date.now() + 60_000).toISOString() }
  fake.ownerAccess.mockResolvedValue(undefined); fake.owned.mockResolvedValue({ revision: 2, project_key: 'project', state: 'ready' }); fake.recordAccess.mockResolvedValue(undefined); fake.agentArtifactAccess.mockResolvedValue([{id:'image',url:'https://fresh.test/image',expiresInSeconds:300}])
})
afterEach(() => vi.unstubAllEnvs())
it('recovers the original pairing code only while its actor still owns an eligible project and the code is live', async () => {
  const data = { code: 'original-code', connectionId: 'storybook-connection' }
  expect(await recover('storybook.pair', data, { projectKey: 'project' })).toMatchObject({ code: 'operation_recovered', data })
  expect(fake.ownerAccess).toHaveBeenCalledWith('project', 'user')
  for (const row of [null, { revoked_at: 'revoked' }, { revoked_at: null, claimed_at: 'claimed' }, { revoked_at: null, claimed_at: null, expires_at: new Date(0).toISOString() }]) {
    fake.row = row
    await expect(recover('storybook.pair', data, { projectKey: 'project' })).rejects.toThrow('pairing_unavailable')
  }
  fake.ownerAccess.mockRejectedValueOnce(new Error('access_denied'))
  await expect(recover('storybook.pair', data, { projectKey: 'project' })).rejects.toThrow('access_denied')
})
it('checks current share access and recovers a refreshed capability rather than the old token', async () => {
  read.mockResolvedValueOnce({ ok: true, status: 200, data: { tokenUrl: 'https://crrt.test/state?token=fresh' } })
  expect(await recover('shares.create', { shareId: 'share', token: 'old' })).toMatchObject({ data: { shareId: 'share', token: 'fresh' } })
  expect(read).toHaveBeenCalledWith('shares.prompt', { shareId: 'share', target: 'generic' })
  read.mockResolvedValueOnce({ ok: false, status: 403, data: null })
  expect(await recover('shares.create', { shareId: 'share', token: 'old' })).toEqual({ ok: false, status: 403, data: null })
})
it('recovers audit identifiers only after current project authorization and preserves account-bound billing URLs', async () => {
  read.mockResolvedValueOnce({ ok: true, status: 200 })
  expect(await recover('audits.create', { auditId: 'audit' })).toMatchObject({ data: { auditId: 'audit' }, code: 'operation_recovered' })
  read.mockResolvedValueOnce({ ok: false, status: 404 })
  expect(await recover('audits.create', { auditId: 'audit' })).toMatchObject({ ok: false, status: 404 })
  expect(await recover('billing.action', { url: 'https://billing.test/original' })).toMatchObject({ data: { url: 'https://billing.test/original' } })
})
it('replays Record context without charging again, but rejects changed revisions/projects/state or lost access', async () => {
  const data = { payload: { recording: { revision: 2 }, project: { key: 'project' } } }
  expect(await recover('recordings.agent_payload', data)).toMatchObject({ code: 'operation_recovered', data })
  expect(fake.owned).toHaveBeenCalledWith('user', 'record')
  expect((await recover('recordings.agent_payload', data)).data).toMatchObject({artifactAccess:[{url:'https://fresh.test/image',expiresInSeconds:300}]})
  for (const row of [{ revision: 3, project_key: 'project', state: 'ready' }, { revision: 2, project_key: null, state: 'ready' }, { revision: 2, project_key: 'project', state: 'failed' }]) {
    fake.owned.mockResolvedValueOnce(row)
    await expect(recover('recordings.agent_payload', data)).rejects.toThrow('record_conflict')
  }
  fake.owned.mockResolvedValueOnce({ revision: 2, project_key: null, state: 'ready' }).mockResolvedValueOnce({ revision: 2, project_key: null, state: 'ready' })
  expect(await recover('recordings.agent_payload', { payload: { recording: { revision: 2 }, project: null } })).toMatchObject({ ok: true })
  fake.owned.mockResolvedValueOnce({ revision: 2, project_key: 'project', state: 'ready' }).mockResolvedValueOnce({ revision: 3, project_key: 'project', state: 'ready' })
  await expect(recover('recordings.agent_payload', data)).rejects.toThrow('record_conflict')
  fake.recordAccess.mockRejectedValueOnce(new Error('record_forbidden'))
  await expect(recover('recordings.agent_payload', data)).rejects.toThrow('record_forbidden')
})
it('does not return historical data for ordinary writes or recorded failures', async () => {
  expect(await recover('inbox.delete', null)).toMatchObject({ data: null, code: 'operation_already_recorded' })
  expect(await recover('storybook.pair', { code: 'private' }, {}, false)).toMatchObject({ data: null, ok: false })
})

it('blocks cached Record recovery when disabled or removed, without reading or signing artifacts', async () => {
  const data={payload:{recording:{revision:2},project:{key:'project'}}}
  expect(await recover('recordings.agent_payload',data)).toMatchObject({ok:true})
  const reads=fake.owned.mock.calls.length, signs=fake.agentArtifactAccess.mock.calls.length
  for(const value of ['false',undefined]){
    vi.stubEnv('CRRT_RECORD_ENABLED',value)
    expect(await recover('recordings.agent_payload',data)).toMatchObject({ok:false,status:503,code:'record_disabled',retryable:false,data:null})
    expect(fake.owned).toHaveBeenCalledTimes(reads)
    expect(fake.agentArtifactAccess).toHaveBeenCalledTimes(signs)
  }
})
it('does not return cached context if Record is disabled while artifact URLs are renewed', async () => {
  fake.agentArtifactAccess.mockImplementationOnce(async()=>{vi.stubEnv('CRRT_RECORD_ENABLED','false');return []})
  expect(await recover('recordings.agent_payload',{payload:{recording:{revision:2},project:{key:'project'}}})).toMatchObject({ok:false,code:'record_disabled',data:null})
})
