// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as unknown[] }))
vi.mock('../../api/_lib/supabase.js', () => {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'select', 'eq', 'update', 'is', 'gt', 'order', 'limit']) query[method] = (...args: unknown[]) => { fake.calls.push([method, ...args]); return query }
  query.then = (resolve: (value: unknown) => void) => resolve(fake.results.shift())
  return { getServiceSupabase: () => ({ ...query, rpc: (...args: unknown[]) => { fake.calls.push(args); return Promise.resolve(fake.results.shift()) } }) }
})
vi.mock('./dashboard-adapter.js', () => ({ runDashboardOperation: vi.fn() }))
vi.mock('./dashboard-access.js', () => ({ requestDashboardAccess: vi.fn() }))
import { ALL_SCOPES } from './auth.js'
import { dashboardTools } from './dashboard.js'
import { runDashboardOperation } from './dashboard-adapter.js'
import { requestDashboardAccess } from './dashboard-access.js'
const id = '11111111-1111-4111-8111-111111111111'
const actor = { user_id: id, connection_id: id, email: 'user@test.local', scope: ALL_SCOPES }
const call = (name: string, input = {}, identity = actor) => dashboardTools.find(tool => tool.name === name)!.run(input, identity)
beforeEach(() => { fake.results = []; fake.calls = []; vi.mocked(runDashboardOperation).mockReset(); vi.mocked(requestDashboardAccess).mockReset(); vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001') })
afterEach(() => vi.unstubAllEnvs())
it('exposes one explicit, annotated tool per allowlisted operation without a generic executor or billing checkout', () => {
  const names = dashboardTools.map(tool => tool.name)
  expect(names).not.toContain('list_dashboard_operations')
  expect(names).not.toContain('run_dashboard_operation')
  expect(dashboardTools.length).toBeGreaterThan(70)
  const update = dashboardTools.find(tool => tool.name === 'update_project_settings')!
  expect(update).toMatchObject({ title: 'Update project settings', annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } })
  expect(Object.keys((update.input as unknown as { shape: object }).shape)).toEqual(expect.arrayContaining(['projectId', 'name', 'userRequested', 'idempotencyKey']))
  expect(dashboardTools.find(tool => tool.name === 'list_dashboard_projects')).toMatchObject({ annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } })
  expect(dashboardTools.find(tool => tool.name === 'send_external_work')).toMatchObject({ annotations: { destructiveHint: false, openWorldHint: true } })
  expect(() => update.input.parse({ projectId: 'project', arbitrary: true })).toThrow()
})
it('returns a single upgrade URL on old grants without running the requested operation', async () => {
  vi.mocked(requestDashboardAccess).mockResolvedValue({ state: 'pending', bundle: 'dashboard-v1' })
  expect(await call('list_dashboard_projects', {}, { ...actor, scope: 'crrt:read' })).toMatchObject({ code: 'permission_upgrade_required', retryable: false })
  expect(runDashboardOperation).not.toHaveBeenCalled()
})
it('requires a human request and retry key for writes even with full access', async () => {
  await expect(call('update_project_settings', { projectId: 'project' })).rejects.toThrow('human_request_required')
  await expect(call('update_project_settings', { projectId: 'project', userRequested: true })).rejects.toThrow('idempotency_key_required')
  await expect(call('update_project_settings', { userRequested: true, idempotencyKey: 'stable-retry-key-123' })).rejects.toThrow()
  expect(runDashboardOperation).not.toHaveBeenCalled()
})
it('revalidates the live grant and passes split query and body fields to the adapter', async () => {
  fake.results.push({ error: null, data: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: true, status: 200, data: { name: 'Renamed' } })
  expect(await call('update_project_settings', { projectId: 'project', name: 'Renamed', userRequested: true, idempotencyKey: 'stable-retry-key-123' })).toMatchObject({ ok: true, operation: 'update_project_settings' })
  expect(fake.calls).toContainEqual(['mcp_require_connection', { p_connection: id, p_actor: id, p_scope: 'crrt:dashboard' }])
  expect(runDashboardOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'projects.update', method: 'PATCH' }), { projectId: 'project' }, { name: 'Renamed' }, actor, 'stable-retry-key-123')
  fake.results.push({ error: null, data: null }, { error: null, data: null })
  await call('get_billing_summary', { availability: '1' })
  await call('get_billing_summary')
  expect(vi.mocked(runDashboardOperation).mock.calls.slice(-2).map(args => args[1])).toEqual([{ availability: '1' }, {}])
  fake.results.push({ error: 'revoked' })
  await expect(call('list_dashboard_projects')).rejects.toThrow('storage_unavailable')
})
it('lists/revokes only the authenticated account connections and preserves explicit intent', async () => {
  await expect(call('manage_mcp_connections', {}, { ...actor, scope: 'crrt:read' })).rejects.toThrow('insufficient_scope')
  await expect(call('manage_mcp_connections', { revokeConnectionId: id })).rejects.toThrow('human_request_required')
  fake.results.push({ error: null, data: [{ id }] })
  expect(await call('manage_mcp_connections')).toMatchObject({ connections: [{ id }] })
  fake.results.push({ error: null }, { error: null, data: [] })
  expect(await call('manage_mcp_connections', { revokeConnectionId: id, userRequested: true })).toMatchObject({ connections: [] })
  expect(fake.calls).toContainEqual(['eq', 'user_id', id])
})

it('pages large authorized array reads and refuses pagination on writes', async () => {
  const read = async (data: unknown, resultPage: unknown) => {
    fake.results.push({ error: null })
    vi.mocked(runDashboardOperation).mockResolvedValue({ ok: true, status: 200, data })
    return call('list_dashboard_projects', { resultPage })
  }
  expect(await read([1, 2, 3], { limit: 2 })).toMatchObject({ data: { items: [1, 2], nextOffset: 2, total: 3 } })
  expect(await read({ comments: [1, 2] }, { field: 'comments', offset: 1 })).toMatchObject({ data: { items: [2], nextOffset: null } })
  for (const data of [null, 1, {}, { comments: 'not an array' }]) await expect(read(data, { field: 'comments' })).rejects.toThrow('array_result_required')
  await expect(read([], { field: 'constructor' })).rejects.toThrow('array_result_required')
  await expect(call('update_project_settings', { projectId: 'project', userRequested: true, idempotencyKey: 'test-pagination-key', resultPage: {} })).rejects.toThrow()
  fake.results.push({ error: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: false, status: 403, data: { error: 'Forbidden' } })
  expect(await call('list_dashboard_projects', { resultPage: {} })).toMatchObject({ ok: false })
})

it('pages nested Record context as a semantic read even though it uses POST', async () => {
  fake.results.push({ error: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: true, status: 200, data: { payload: { transcript: [1,2,3] } } })
  const args = { id, requestKey:id, idempotencyKey:'record-read-retry-key', resultPage:{field:'payload.transcript',limit:2} }
  expect(await call('get_recording_agent_context', args)).toMatchObject({data:{items:[1,2],nextOffset:2}})
  expect(runDashboardOperation).toHaveBeenCalledWith(expect.objectContaining({name:'recordings.agent_payload'}), {id}, {requestKey:id}, actor, 'record-read-retry-key')
  expect(dashboardTools.find(tool => tool.name === 'get_recording_agent_context')).toMatchObject({annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false}})
  await expect(call('get_recording_agent_context',{id, requestKey:id})).rejects.toThrow('idempotency_key_required')
})

it('keeps large nested Record pages within the MCP response budget', async () => {
  const transcript=Array.from({length:1000},(_,id)=>({id,text:'recording context '.repeat(100)}))
  expect(Buffer.byteLength(JSON.stringify(transcript))).toBeGreaterThan(131072)
  fake.results.push({error:null})
  vi.mocked(runDashboardOperation).mockResolvedValue({ok:true,status:200,data:{payload:{transcript}}})
  const result=await call('get_recording_agent_context',{id,requestKey:id,idempotencyKey:'large-record-read-key',resultPage:{field:'payload.transcript',limit:5}})
  expect(result).toMatchObject({data:{items:transcript.slice(0,5),nextOffset:5,total:1000}})
  expect(Buffer.byteLength(JSON.stringify(result))*2).toBeLessThan(131072)
})
