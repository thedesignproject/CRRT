// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createProof, hashProof, pkceChallenge } from '../../api/_lib/extension-auth-contracts.js'
const fake = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as unknown[], getUser: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'select', 'eq', 'is', 'gt', 'order', 'limit', 'insert', 'update']) query[method] = (...args: unknown[]) => { fake.calls.push([method, ...args]); return query }
  query.then = (resolve: (value: unknown) => void) => resolve(fake.results.shift())
  query.single = query.maybeSingle = () => Promise.resolve(fake.results.shift())
  return {
    getServiceSupabase: () => ({ ...query, rpc: (...args: unknown[]) => { fake.calls.push(args); return Promise.resolve(fake.results.shift()) } }),
    getNonPersistentSupabase: () => ({ auth: { getUser: fake.getUser } }),
  }
})
import { authorize, config, identity, oauth, reserve, SCOPES, ALL_SCOPES, normalizeScope, hasScope } from './auth.js'
const id = '11111111-1111-4111-8111-111111111111'
const resource = 'http://127.0.0.1:3001/api/mcp/v1'
const callback = 'http://localhost:8765/callback'
const code = createProof(), verifier = createProof(), credential = `crrt_mcp_${createProof()}`
const params = { client_id: id, redirect_uri: callback, response_type: 'code', code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', state: 'state', scope: 'crrt:read', resource }
const ok = (data: unknown = null) => ({ data, error: null })
const issued = () => ok({ expires_at: new Date(Date.now() + 900_000).toISOString() })
const app = () => ok({ id, name: 'Test client', redirect_uris: [callback] })
const user = () => fake.getUser.mockResolvedValue({ data: { user: { id, email: 'a@test.local' } }, error: null })
async function call(action: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await oauth(new Request(`http://127.0.0.1:3001/api/mcp/oauth/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  return { response, data: response.status === 302 ? null : await response.json() }
}
beforeEach(() => {
  vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001')
  vi.stubEnv('APP_URL', undefined)
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('VERCEL_URL', undefined)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('MCP_CALLBACK_ORIGINS', '')
  fake.results = []; fake.calls = []; fake.getUser.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
describe('MCP OAuth boundary', () => {
  it('uses configured origins rather than request hosts', async () => {
    expect(config().resource).toBe(resource)
    expect((await call('metadata')).data).toMatchObject({ issuer: 'http://127.0.0.1:3001', scopes_supported: SCOPES })
    expect((await call('resource')).data).toMatchObject({ resource, bearer_methods_supported: ['header'] })
    for (const value of ['https://x.test/path', 'https://x.test/?x=1', 'https://x.test/#x', 'https://u:p@x.test']) {
      vi.stubEnv('MCP_ORIGIN', value); expect(() => config()).toThrow('invalid_origin')
    }
    vi.stubEnv('MCP_ORIGIN', 'http://untrusted.test'); expect(() => config()).toThrow('https_required')
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MCP_ORIGIN', 'http://localhost'); expect(() => config()).toThrow('https_required')
    vi.stubEnv('MCP_ORIGIN', 'https://crrt.test'); expect(config().resource).toBe('https://crrt.test/api/mcp/v1')
    vi.stubEnv('MCP_ORIGIN', 'ftp://crrt.test'); expect(() => config()).toThrow('https_required')
  })
  it('uses APP_URL by default and validates optional MCP_ORIGIN overrides', async () => {
    vi.stubEnv('MCP_ORIGIN', undefined)
    vi.stubEnv('APP_URL', 'https://crrt.ai/')
    expect(config()).toEqual({ origin: 'https://crrt.ai', resource: 'https://crrt.ai/api/mcp/v1' })
    expect((await call('metadata')).data).toMatchObject({ issuer: 'https://crrt.ai' })
    vi.stubEnv('APP_URL', 'https://crrt-4wsv8yc98-designproject.vercel.app')
    expect(config().origin).toBe('https://crrt-4wsv8yc98-designproject.vercel.app')
    vi.stubEnv('MCP_ORIGIN', 'https://mcp.crrt.ai')
    expect(config().origin).toBe('https://mcp.crrt.ai')
    vi.stubEnv('MCP_ORIGIN', '')
    expect(() => config()).toThrow()
    vi.stubEnv('MCP_ORIGIN', undefined)
    vi.stubEnv('APP_URL', 'https://crrt.ai/dashboard/')
    expect(() => config()).toThrow('invalid_origin')
    vi.stubEnv('APP_URL', 'http://crrt.ai')
    expect(() => config()).toThrow('https_required')
  })
  it('derives an exact preview origin only when explicit configuration is absent', () => {
    vi.stubEnv('MCP_ORIGIN', undefined)
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(() => config()).toThrow()
    vi.stubEnv('VERCEL_URL', 'crrt-4wsv8yc98-designproject.vercel.app')
    expect(config().origin).toBe('https://crrt-4wsv8yc98-designproject.vercel.app')
    vi.stubEnv('APP_URL', 'https://preview.crrt.ai')
    expect(config().origin).toBe('https://preview.crrt.ai')
    vi.stubEnv('MCP_ORIGIN', 'https://mcp.crrt.ai')
    expect(config().origin).toBe('https://mcp.crrt.ai')
    vi.stubEnv('APP_URL', undefined); vi.stubEnv('MCP_ORIGIN', undefined)
    vi.stubEnv('VERCEL_URL', 'preview.test/path')
    expect(() => config()).toThrow('invalid_origin')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(() => config()).toThrow()
  })
  it('fails closed for missing/invalid configuration and unsupported methods', async () => {
    vi.stubEnv('MCP_ORIGIN', undefined); expect((await call('resource')).response.status).toBe(400)
    vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001')
    expect((await call('bad')).response.status).toBe(405)
    expect((await call('bad', {})).response.status).toBe(404)
    expect((await call('register', {}, { 'content-length': '20000' })).response.status).toBe(413)
    expect((await call('register', { padding: 'x'.repeat(17000) })).response.status).toBe(413)
    expect((await call('register', null)).response.status).toBe(400)
  })
  it('registers bounded clients and checks every redirect', async () => {
    vi.stubEnv('MCP_CALLBACK_ORIGINS', undefined)
    fake.results.push(ok(true), ok({ id }))
    const registered = await call('register', { client_name: 'Client', redirect_uris: [callback] })
    expect(registered.response.status).toBe(201); expect(registered.data.client_id).toBe(id)
    for (const redirect of ['https://bad.test/cb', 'http://bad.test/cb', 'http://u:p@localhost/cb', `${callback}#fragment`]) {
      expect((await call('register', { client_name: 'Client', redirect_uris: [redirect] })).response.status).toBe(400)
    }
    vi.stubEnv('MCP_CALLBACK_ORIGINS', 'https://trusted.test')
    fake.results.push(ok(true), ok({ id }))
    expect((await call('register', { client_name: 'Client', redirect_uris: ['https://trusted.test/cb'] })).response.status).toBe(201)
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MCP_ORIGIN', 'https://crrt.test')
    expect((await call('register', { client_name: 'Client', redirect_uris: [callback] })).response.status).toBe(400)
  })
  it('checks resource, client existence, and exact callback before sign-in', async () => {
    await expect(authorize({ ...params, resource: 'https://wrong.test' })).rejects.toThrow('invalid_target')
    fake.results.push(ok(null)); await expect(authorize(params)).rejects.toThrow('invalid_client')
    fake.results.push(app()); await expect(authorize({ ...params, redirect_uri: `${callback}?wrong=1` })).rejects.toThrow('invalid_redirect_uri')
    fake.results.push(app())
    const response = await oauth(new Request(`http://127.0.0.1:3001/api/mcp/oauth/authorize?${new URLSearchParams(params)}`))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/dashboard/mcp-auth?')
    vi.stubEnv('MCP_DASHBOARD_URL', 'http://127.0.0.1:5173/dashboard/mcp-auth'); fake.results.push(app())
    expect((await oauth(new Request(`http://127.0.0.1:3001/api/mcp/oauth/authorize?${new URLSearchParams(params)}`))).headers.get('location')).toContain(':5173/')
    for (const dashboard of ['https://x.test/wrong', 'https://x.test/dashboard/mcp-auth?x=1', 'https://x.test/dashboard/mcp-auth#x']) {
      vi.stubEnv('MCP_DASHBOARD_URL', dashboard); fake.results.push(app())
      expect((await oauth(new Request(`http://127.0.0.1:3001/api/mcp/oauth/authorize?${new URLSearchParams(params)}`))).status).toBe(503)
    }
  })
  it('requires existing CRRT login for consent and never forwards a Supabase session', async () => {
    expect((await call('consent', params)).response.status).toBe(401)
    fake.getUser.mockResolvedValue({ data: { user: null }, error: new Error() })
    expect((await call('consent', params, { authorization: 'Bearer session' })).response.status).toBe(401)
    fake.getUser.mockResolvedValue({ data: { user: {} }, error: null })
    expect((await call('consent', params, { authorization: 'Bearer session' })).response.status).toBe(401)
    user(); fake.results.push(ok(true), app())
    expect((await call('consent', { ...params, decision: 'inspect' }, { authorization: 'Bearer session' })).data).toEqual({ name: 'Test client', scope: 'crrt:read', redirectUri: callback })
    fake.results.push(ok(true), app())
    expect((await call('consent', { ...params, decision: 'wrong' }, { authorization: 'Bearer session' })).response.status).toBe(400)
    fake.results.push(ok(true), app())
    const denied = await call('consent', { ...params, decision: 'deny' }, { authorization: 'Bearer session' })
    expect(denied.data.redirectUrl).toContain('error=access_denied')
    fake.results.push(ok(true), app(), ok())
    const approved = await call('consent', { ...params, decision: 'approve' }, { authorization: 'Bearer session' })
    expect(approved.response.status).toBe(200)
    expect(new URL(approved.data.redirectUrl).searchParams.get('code')).toHaveLength(43)
    expect(fake.calls).toContainEqual(['insert', expect.objectContaining({ hash: expect.stringMatching(/^[a-f0-9]{64}$/), user_id: id })])
  })
  it('lists only the signed-in user connections and scopes revocation by owner', async () => {
    user(); fake.results.push(ok([]))
    expect((await call('connections', {}, { authorization: 'Bearer session' })).data).toEqual({ connections: [] })
    fake.results.push(ok(), ok([]))
    expect((await call('connections', { connectionId: id }, { authorization: 'Bearer session' })).response.status).toBe(200)
    expect(fake.calls).toContainEqual(['eq', 'user_id', id])
  })
  it('exchanges codes and rotates refresh credentials using hashed database RPC inputs', async () => {
    fake.results.push(app(), ok({ hash: "known", scope: "crrt:read", mcp_connections: { scope: "crrt:read" } }), ok(true), ok(id), issued())
    const result = await call('token', { ...params, grant_type: 'authorization_code', code, code_verifier: verifier })
    expect(result.data).toMatchObject({ token_type: 'Bearer', expires_in: expect.any(Number), scope: 'crrt:read', access_token: expect.stringMatching(/^crrt_mcp_/) })
    expect(fake.calls).toContainEqual(['mcp_exchange', expect.objectContaining({ p_hash: hashProof(code), p_challenge: pkceChallenge(verifier) })])
    fake.results.push(app(), ok({ hash: "known", scope: "crrt:read", mcp_connections: { scope: "crrt:read" } }), ok(true), ok(id), issued())
    expect((await call('token', { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential })).response.status).toBe(200)
    fake.results.push(app(), ok())
    expect((await call('revoke', { client_id: id, token: credential })).response.status).toBe(200)
    fake.results.push(app(), ok({ hash: "known", scope: "crrt:read", mcp_connections: { scope: "crrt:read" } }), ok(true), ok(null))
    expect((await call('token', { ...params, grant_type: 'authorization_code', code, code_verifier: verifier })).data.error).toBe('invalid_grant')
    fake.results.push(app())
    expect((await call('token', { client_id: id, resource: 'wrong' })).data.error).toBe('invalid_target')
    fake.results.push(app())
    expect((await call('token', { client_id: id, resource, grant_type: 'password' })).data.error).toBe('unsupported_grant_type')
    fake.results.push(app(), ok({ hash: "known", scope: "crrt:read", mcp_connections: { scope: "crrt:read" } }), ok(true), ok(id), issued())
    const form = new URLSearchParams({ ...params, grant_type: 'authorization_code', code, code_verifier: verifier })
    expect((await oauth(new Request('http://127.0.0.1:3001/api/mcp/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }))).status).toBe(200)
  })
  it('fails closed without exposing storage or unexpected error details', async () => {
    fake.results.push({ data: null, error: { message: 'private secret' } })
    expect((await call('register', { client_name: 'Client', redirect_uris: [callback] })).data).toEqual({ error: 'storage_unavailable' })
    fake.getUser.mockRejectedValue(new Error('private secret'))
    expect((await call('consent', params, { authorization: 'Bearer session' })).data).toEqual({ error: 'temporarily_unavailable' })
    fake.results.push(ok(false)); await expect(reserve('key', 1)).rejects.toThrow('rate_limited')
    fake.results.push(ok(true), ok(null)); expect((await call('register', { client_name: 'Client', redirect_uris: [callback] })).response.status).toBe(503)
  })
  it('accepts only active resource-bound MCP access credentials in the Authorization header', async () => {
    for (const header of [null, '', 'Basic xyz', 'Bearer supabase-token']) await expect(identity(header)).rejects.toThrow('invalid_token')
    fake.results.push(ok([])); await expect(identity(`Bearer ${credential}`)).rejects.toThrow('invalid_token')
    const actor = { user_id: id, email: 'a@test.local', connection_id: id }
    fake.results.push(ok([actor])); expect(await identity(`Bearer ${credential}`)).toEqual(actor)
    expect(fake.calls).toContainEqual(['mcp_identity', { p_hash: hashProof(credential), p_resource: resource }])
  })
})

it('isolates grant budgets by proven credentials and never throttles revocation by public client ID', async () => {
  for (let i = 0; i < 121; i++) {
    fake.results.push(app())
    expect((await call('token', { client_id: id, resource, grant_type: 'password' })).response.status).toBe(400)
  }
  for (const grant of [
    { ...params, grant_type: 'authorization_code', code, code_verifier: verifier },
    { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential },
  ]) {
    fake.results.push(app(), ok(null))
    expect((await call('token', grant)).data.error).toBe('invalid_grant')
  }
  expect(fake.calls.filter((call: any) => call[0] === 'mcp_reserve')).toEqual([])
  fake.results.push(app(), ok())
  expect((await call('revoke', { client_id: id, token: credential })).response.status).toBe(200)
  expect(fake.calls.filter((call: any) => call[0] === 'mcp_reserve')).toEqual([])
  fake.results.push(app(), ok({ hash: 'known', scope: 'crrt:read', mcp_connections: { scope: 'crrt:read' } }), ok(true), ok(id), issued())
  expect((await call('token', { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential })).response.status).toBe(200)
  expect(fake.calls).toContainEqual(['mcp_reserve', { p_key: `refresh:${hashProof(credential)}`, p_limit: 120 }])
})

it('accepts only literal loopback HTTP callbacks in production with exact registration and PKCE', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('MCP_ORIGIN', 'https://mcp.test')
  const productionResource = 'https://mcp.test/api/mcp/v1'
  for (const redirect of ['http://127.0.0.1:51765/callback', 'http://[::1]:51765/callback']) {
    fake.results.push(ok(true), ok({ id }))
    expect((await call('register', { client_name: 'Native client', redirect_uris: [redirect] })).response.status).toBe(201)
    const registered = () => ok({ id, name: 'Native client', redirect_uris: [redirect] })
    const request = { ...params, redirect_uri: redirect, resource: productionResource }
    fake.results.push(registered())
    await expect(authorize(request)).resolves.toMatchObject({ params: request })
    for (const mismatch of [redirect.replace(':51765', ':51766'), `${redirect}/other`, `${redirect}?unexpected=1`]) {
      fake.results.push(registered())
      await expect(authorize({ ...request, redirect_uri: mismatch })).rejects.toThrow('invalid_redirect_uri')
    }
    await expect(authorize({ ...request, code_challenge_method: 'plain' })).rejects.toThrow()
    fake.results.push(registered(), ok(null))
    expect((await call('token', { ...request, grant_type: 'authorization_code', code, code_verifier: createProof() })).data.error).toBe('invalid_grant')
    fake.results.push(registered(), ok({ hash: 'known', scope: 'crrt:read', mcp_connections: { scope: 'crrt:read' } }), ok(true), ok(id), issued())
    expect((await call('token', { ...request, grant_type: 'authorization_code', code, code_verifier: verifier })).response.status).toBe(200)
  }
  vi.stubEnv('MCP_CALLBACK_ORIGINS', 'http://evil.test,http://localhost:51765')
  for (const redirect of ['http://evil.test/callback', 'http://localhost:51765/callback', 'http://127.0.0.1.evil.test/callback', 'http://0.0.0.0:51765/callback', 'http://127.0.0.2:51765/callback', 'http://[::]:51765/callback', 'http://user:password@127.0.0.1:51765/callback', 'http://127.0.0.1:51765/callback#fragment']) {
    expect((await call('register', { client_name: 'Bad callback', redirect_uris: [redirect] })).data.error).toBe('invalid_redirect_uri')
  }
  vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001')
  expect(() => config()).toThrow('https_required')
})

it('grants only consented scopes and preserves them on refresh', async () => {
  expect(normalizeScope('crrt:review crrt:read crrt:implement')).toBe(ALL_SCOPES)
  for (const scope of ['', 'crrt:implement', 'crrt:read admin', 'crrt:read  crrt:review']) expect(() => normalizeScope(scope)).toThrow('invalid_scope')
  expect(hasScope({ user_id: id, email: '', connection_id: id }, 'crrt:implement')).toBe(false)
  expect(hasScope({ user_id: id, email: '', connection_id: id, scope: ALL_SCOPES }, 'crrt:review')).toBe(true)
  user(); fake.results.push(ok(true), app())
  expect((await call('consent', { ...params, scope: ALL_SCOPES, decision: 'inspect' }, { authorization: 'Bearer session' })).data.scope).toBe(ALL_SCOPES)
  fake.results.push(ok(true), app(), ok())
  await call('consent', { ...params, scope: ALL_SCOPES, decision: 'approve' }, { authorization: 'Bearer session' })
  expect(fake.calls).toContainEqual(['insert', expect.objectContaining({ scope: ALL_SCOPES })])
  fake.results.push(app(), ok({ hash: 'known', scope: ALL_SCOPES }), ok(true), ok(id), issued())
  expect((await call('token', { ...params, scope: ALL_SCOPES, grant_type: 'authorization_code', code, code_verifier: verifier })).data.scope).toBe(ALL_SCOPES)
  fake.results.push(app(), ok({ hash: 'known', mcp_connections: { scope: 'crrt:read' } }), ok(true), ok(id), issued())
  expect((await call('token', { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential, scope: ALL_SCOPES })).data.scope).toBe('crrt:read')
  fake.results.push(app())
  const { scope, ...withoutScope } = params
  expect((await authorize(withoutScope)).params.scope).toBe(ALL_SCOPES)
})

it('reports the actual issued lifetime near connection expiry and fails closed on missing expiry', async () => {
  const now = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  try {
    for (const [remaining, expected] of [[60, 60], [0, 0], [1800, 900]]) {
      fake.results.push(app(), ok({ hash: 'known', mcp_connections: { scope: 'crrt:read' } }), ok(true), ok(id), ok({ expires_at: new Date(now + remaining * 1000).toISOString() }))
      expect((await call('token', { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential })).data.expires_in).toBe(expected)
    }
    for (const row of [null, { expires_at: 'invalid' }, { expires_at: 123 }]) {
      fake.results.push(app(), ok({ hash: 'known', mcp_connections: { scope: 'crrt:read' } }), ok(true), ok(id), ok(row))
      expect((await call('token', { client_id: id, resource, grant_type: 'refresh_token', refresh_token: credential })).data.error).toBe('storage_unavailable')
    }
  } finally { clock.mockRestore() }
})
