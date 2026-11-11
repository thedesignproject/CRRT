// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as unknown[] }))
vi.mock('../../api/_lib/supabase.js', () => {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'select', 'eq']) query[method] = (...args: unknown[]) => { fake.calls.push([method, ...args]); return query }
  query.maybeSingle = () => Promise.resolve(fake.results.shift())
  return { getServiceSupabase: () => ({ ...query, rpc: (...args: unknown[]) => { fake.calls.push(args); return Promise.resolve(fake.results.shift()) } }) }
})
import { ALL_SCOPES } from './auth.js'
import { dashboardAccessTools, decideDashboardAccess, requestDashboardAccess } from './dashboard-access.js'
const id = '11111111-1111-4111-8111-111111111111'
const actor = { user_id: id, connection_id: id, email: 'user@test.local', scope: 'crrt:read' }
const ok = (data: unknown) => ({ data, error: null })
const call = (name: string, input = {}, identity = actor) => dashboardAccessTools.find(tool => tool.name === name)!.run(input, identity)
beforeEach(() => { fake.results = []; fake.calls = []; vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001'); vi.stubEnv('MCP_DASHBOARD_URL', undefined) })
afterEach(() => vi.unstubAllEnvs())
it('reports precise grants without claiming executor readiness', async () => {
  expect(await call('connection_status')).toMatchObject({ dashboardAccess: 'upgrade_required', dashboardBundle: null, scopes: ['crrt:read'], executorReadiness: 'not_established' })
  expect(await call('connection_status', {}, { ...actor, scope: ALL_SCOPES })).toMatchObject({ dashboardAccess: 'approved', dashboardBundle: 'dashboard-v1' })
  expect(await call('connection_status', {}, { ...actor, scope: undefined } as never)).toMatchObject({ scopes: ['crrt:read'] })
})
it('creates a connection-bound full-suite request and never requests approval again after upgrade', async () => {
  const expires = new Date(Date.now() + 60_000).toISOString()
  fake.results.push(ok({ id, expires_at: expires }))
  expect(await call('request_dashboard_access')).toMatchObject({ state: 'pending', bundle: 'dashboard-v1', requestId: id, approvalUrl: `http://127.0.0.1:3001/dashboard/mcp-auth?upgrade=${id}`, expiresAt: expires })
  expect(fake.calls).toContainEqual(['mcp_request_dashboard_upgrade', { p_connection: id, p_actor: id }])
  expect(await requestDashboardAccess({ ...actor, scope: ALL_SCOPES })).toEqual({ state: 'approved', bundle: 'dashboard-v1' })
  vi.stubEnv('MCP_DASHBOARD_URL', 'http://127.0.0.1:5173/dashboard/mcp-auth')
  fake.results.push(ok({ id, expires_at: expires }))
  expect(await call('request_dashboard_access')).toMatchObject({ approvalUrl: `http://127.0.0.1:5173/dashboard/mcp-auth?upgrade=${id}` })
})
it.each(['pending', 'approved', 'declined'])('reads %s state only within this connection', async state => {
  fake.results.push(ok({ state, bundle: 'dashboard-v1', expires_at: new Date(Date.now() + 60_000).toISOString() }))
  expect(await call('request_dashboard_access', { requestId: id })).toMatchObject({ state, granted: false })
  expect(fake.calls).toContainEqual(['eq', 'connection_id', id])
})
it('shows expiry without changing granted access and refuses foreign/missing requests', async () => {
  fake.results.push(ok({ state: 'pending', bundle: 'dashboard-v1', expires_at: new Date(0).toISOString() }))
  expect(await call('request_dashboard_access', { requestId: id }, { ...actor, scope: ALL_SCOPES })).toMatchObject({ state: 'expired', granted: true })
  fake.results.push(ok(null))
  await expect(call('request_dashboard_access', { requestId: id })).rejects.toThrow('upgrade_unavailable')
  await expect(call('request_dashboard_access', { requestId: 'invalid' })).rejects.toThrow()
})
it('delegates browser approval to the actor-bound transactional RPC and rejects invalid decisions', async () => {
  fake.results.push(ok({ state: 'approved', name: 'Client', bundle: 'dashboard-v1' }))
  expect(await decideDashboardAccess({ requestId: id, decision: 'approve' }, actor.user_id)).toMatchObject({ state: 'approved', scope: ALL_SCOPES })
  expect(fake.calls).toContainEqual(['mcp_decide_dashboard_upgrade', { p_request: id, p_actor: id, p_decision: 'approve' }])
  fake.results.push({ error: 'private db failure' })
  await expect(decideDashboardAccess({ requestId: id, decision: 'inspect' }, id)).rejects.toThrow('upgrade_unavailable')
  await expect(decideDashboardAccess({ requestId: id, decision: 'bad' }, id)).rejects.toThrow()
})
