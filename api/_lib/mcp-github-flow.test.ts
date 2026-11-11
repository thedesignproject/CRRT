// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as unknown[] }))
vi.mock('./supabase.js', () => {
  const q: Record<string, unknown> = {}
  for (const name of ['from','insert','select','eq','update','is']) q[name] = (...args: unknown[]) => { fake.calls.push([name,...args]); return q }
  q.then = (done: (value: unknown) => void) => done(fake.results.shift())
  q.single = q.maybeSingle = () => Promise.resolve(fake.results.shift())
  return { getServiceSupabase: () => ({ ...q, rpc: (...args: unknown[]) => { fake.calls.push(args); return Promise.resolve(fake.results.shift()) } }) }
})
import { startMcpGithubFlow, completeMcpGithubFlow, readMcpGithubFlow } from './mcp-github-flow.js'
import { encryptToken } from './tokens.js'
const flow = { connectionId: 'connection', requestKey: 'github-flow_11111111-1111-4111-8111-111111111111' }
const digest = createHash('sha256').update(JSON.stringify(['github-flow','connection','user','project'])).digest('hex')
const ok = (data: unknown = null) => ({ data, error: null })
const row = (response: unknown = null) => ({ request_hash: digest, response, created_at: new Date().toISOString() })
beforeEach(() => { fake.results = []; fake.calls = []; vi.stubEnv('SHARE_TOKEN_SECRET','local-test-secret') })
afterEach(() => vi.unstubAllEnvs())
it('starts a short-lived actor/connection/project-bound flow without storing credentials', async () => {
  fake.results.push(ok(), ok({ created_at: new Date().toISOString() }))
  expect(await startMcpGithubFlow('connection','user','project')).toMatchObject({ flowId: expect.stringMatching(/^github-flow_/), expiresAt: expect.any(String) })
  expect(fake.calls).toContainEqual(['mcp_require_connection', { p_connection: 'connection', p_actor: 'user', p_scope: 'crrt:dashboard' }])
  fake.results.push({ error: 'revoked' })
  await expect(startMcpGithubFlow('connection','user','project')).rejects.toThrow('github_flow_unavailable')
  for (const result of [ok(null), { error: 'storage' }]) {
    fake.results.push(ok(), result)
    await expect(startMcpGithubFlow('connection','user','project')).rejects.toThrow('github_flow_unavailable')
  }
})
it('returns pending then the encrypted verified result without depending on a browser opener', async () => {
  fake.results.push(ok(), ok(row()))
  expect(await readMcpGithubFlow(flow,'user','project')).toMatchObject({ state: 'pending' })
  fake.results.push(ok(), ok(row()), ok())
  await completeMcpGithubFlow(flow,'user','project',{ installationToken: 'private-proof', repositories: [] })
  const update = fake.calls.find(value => (value as unknown[])[0] === 'update') as [string,{response: unknown}]
  expect(JSON.stringify(update)).not.toContain('private-proof')
  expect(fake.calls).toContainEqual(['is','response',null])
  fake.results.push(ok(),ok(row(update[1].response)))
  expect(await readMcpGithubFlow(flow,'user','project')).toMatchObject({ state: 'verified', installationToken: 'private-proof', repositories: [] })
})
it('rejects foreign, expired, missing and revoked flows and persistence failures', async () => {
  await expect(readMcpGithubFlow({ ...flow, requestKey:'ordinary-retry-key' },'user','project')).rejects.toThrow('github_flow_unavailable')
  for (const result of [ok(null), { error:'db' }, ok({ ...row(), request_hash: 'another-actor-or-project' }), ok({ ...row(), created_at: new Date(0).toISOString() })]) {
    fake.results.push(ok(), result)
    await expect(readMcpGithubFlow(flow,'user','project')).rejects.toThrow('github_flow_unavailable')
  }
  fake.results.push(ok(), ok(row()), { error:'storage' })
  await expect(completeMcpGithubFlow(flow,'user','project',{ installationToken:'proof',repositories:[] })).rejects.toThrow('github_flow_unavailable')
  fake.results.push(ok(), ok(row({ ciphertext: encryptToken('invalid json') })))
  await expect(readMcpGithubFlow(flow,'user','project')).rejects.toThrow()
})
