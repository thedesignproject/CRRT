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
it('discovers the full suite before consent and supplies explicit operation contracts', async () => {
  const result = await call('list_dashboard_operations')
  expect((result.operations as unknown[]).length).toBeGreaterThan(60)
  expect(await call('list_dashboard_operations', { operation: 'members.role' })).toMatchObject({ write: true, requiredQueryKeys: ['projectId', 'userId'], bodyContract: expect.stringContaining('role') })
  expect(await call('list_dashboard_operations', { operation: 'projects.list' })).toMatchObject({ write: false, bodyContract: 'No body' })
  await expect(call('list_dashboard_operations', { operation: 'arbitrary.sql' })).rejects.toThrow()
})
it('returns a single upgrade URL on old grants without running the requested operation', async () => {
  vi.mocked(requestDashboardAccess).mockResolvedValue({ state: 'pending', bundle: 'dashboard-v1' })
  expect(await call('run_dashboard_operation', { operation: 'projects.list' }, { ...actor, scope: 'crrt:read' })).toMatchObject({ code: 'permission_upgrade_required', retryable: false })
  expect(runDashboardOperation).not.toHaveBeenCalled()
})
it('requires a human request and retry key for writes even with full access', async () => {
  await expect(call('run_dashboard_operation', { operation: 'projects.update' })).rejects.toThrow('human_request_required')
  await expect(call('run_dashboard_operation', { operation: 'projects.update', userRequested: true })).rejects.toThrow('idempotency_key_required')
  expect(runDashboardOperation).not.toHaveBeenCalled()
})
it('revalidates the live grant and passes only the allowlisted operation to the adapter', async () => {
  fake.results.push({ error: null, data: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: true, status: 200, data: { name: 'Renamed' } })
  expect(await call('run_dashboard_operation', { operation: 'projects.update', query: { projectId: 'project' }, body: { name: 'Renamed' }, userRequested: true, idempotencyKey: 'stable-retry-key-123' })).toMatchObject({ ok: true, operation: 'projects.update' })
  expect(fake.calls).toContainEqual(['mcp_require_connection', { p_connection: id, p_actor: id, p_scope: 'crrt:dashboard' }])
  expect(runDashboardOperation).toHaveBeenCalledWith(expect.objectContaining({ name: 'projects.update', method: 'PATCH' }), { projectId: 'project' }, { name: 'Renamed' }, actor, 'stable-retry-key-123')
  fake.results.push({ error: 'revoked' })
  await expect(call('run_dashboard_operation', { operation: 'projects.list' })).rejects.toThrow('storage_unavailable')
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
    return call('run_dashboard_operation', { operation: 'projects.list', resultPage })
  }
  expect(await read([1, 2, 3], { limit: 2 })).toMatchObject({ data: { items: [1, 2], nextOffset: 2, total: 3 } })
  expect(await read({ comments: [1, 2] }, { field: 'comments', offset: 1 })).toMatchObject({ data: { items: [2], nextOffset: null } })
  for (const data of [null, 1, {}, { comments: 'not an array' }]) await expect(read(data, { field: 'comments' })).rejects.toThrow('array_result_required')
  await expect(read([], { field: 'constructor' })).rejects.toThrow('array_result_required')
  await expect(call('run_dashboard_operation', { operation: 'projects.update', userRequested: true, idempotencyKey: 'test-pagination-key', resultPage: {} })).rejects.toThrow('read_pagination_only')
  fake.results.push({ error: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: false, status: 403, data: { error: 'Forbidden' } })
  expect(await call('run_dashboard_operation', { operation: 'projects.list', resultPage: {} })).toMatchObject({ ok: false })
})

it('pages nested Record context as a semantic read even though it uses POST', async () => {
  fake.results.push({ error: null })
  vi.mocked(runDashboardOperation).mockResolvedValue({ ok: true, status: 200, data: { payload: { transcript: [1,2,3] } } })
  const args = { operation:'recordings.agent_payload', query:{id}, body:{requestKey:id}, idempotencyKey:'record-read-retry-key', resultPage:{field:'payload.transcript',limit:2} }
  expect(await call('run_dashboard_operation', args)).toMatchObject({data:{items:[1,2],nextOffset:2}})
  expect(await call('list_dashboard_operations',{operation:'recordings.agent_payload'})).toMatchObject({write:false})
  await expect(call('run_dashboard_operation',{operation:'recordings.agent_payload'})).rejects.toThrow('idempotency_key_required')
})

it('keeps large nested Record pages within the MCP response budget', async () => {
  const transcript=Array.from({length:1000},(_,id)=>({id,text:'recording context '.repeat(100)}))
  expect(Buffer.byteLength(JSON.stringify(transcript))).toBeGreaterThan(131072)
  fake.results.push({error:null})
  vi.mocked(runDashboardOperation).mockResolvedValue({ok:true,status:200,data:{payload:{transcript}}})
  const result=await call('run_dashboard_operation',{operation:'recordings.agent_payload',query:{id},body:{requestKey:id},idempotencyKey:'large-record-read-key',resultPage:{field:'payload.transcript',limit:5}})
  expect(result).toMatchObject({data:{items:transcript.slice(0,5),nextOffset:5,total:1000}})
  expect(Buffer.byteLength(JSON.stringify(result))*2).toBeLessThan(131072)
})
