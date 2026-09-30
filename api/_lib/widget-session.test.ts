import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashProof, pkceChallenge } from './extension-auth-contracts.js'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./store.js', () => ({ getProject: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { getProject } from './store.js'
import { assertWidgetPage, assertWidgetProject, createWidgetHandoff, exchangeWidgetHandoff, requireWidgetSession, revokeWidgetSession } from './widget-session.js'
const proof = 'a'.repeat(43)
const origin = 'https://app.example.com'
const session = { user_id: 'user', project_key: 'project', origin, display_name: 'ada', expires_at: '2099-01-01' }
const request = { projectKey: 'project', origin, state: proof, codeChallenge: pkceChallenge(proof) }
const exchange = { projectKey: 'project', code: proof, state: proof, verifier: proof }
const req = { headers: { authorization: `Bearer crrt_widget_${proof}`, origin } } as never
function database(results: unknown[] = [{ data: session, error: null }]) {
  const queue = [...results]
  const q: any = {}
  for (const key of ['delete', 'lt', 'insert', 'update', 'eq', 'is', 'gt', 'select']) q[key] = vi.fn(() => q)
  q.maybeSingle = vi.fn(async () => queue.shift())
  q.then = (resolve: any, reject: any) => Promise.resolve(queue.shift()).then(resolve, reject)
  vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => q) } as never)
  return q
}
beforeEach(() => { vi.mocked(getProject).mockResolvedValue({ allowedOrigins: ['example.com'] } as never) })
describe('widget handoff and session boundary', () => {
  it('stores only hashes and binds a handoff to identity, project, exact origin and proof', async () => {
    const q = database([{ error: null }, { error: null }])
    const result = await createWidgetHandoff(request, { userId: 'user', email: 'ada@example.com' })
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ code_hash: hashProof(result.code), state_hash: hashProof(proof), pkce_challenge: request.codeChallenge, user_id: 'user', project_key: 'project', origin, display_name: 'ada' }))
    expect(JSON.stringify(q.insert.mock.calls)).not.toContain(result.code)
  })
  it('rejects invalid handoffs and disallowed projects', async () => {
    await expect(createWidgetHandoff({}, { userId: 'user', email: 'x' })).rejects.toMatchObject({ status: 400 })
    await expect(assertWidgetProject('project', 'https://evil.test')).rejects.toMatchObject({ status: 403 })
    vi.mocked(getProject).mockResolvedValue(null)
    await expect(assertWidgetProject('missing', origin)).rejects.toMatchObject({ status: 403 })
  })
  it.each([[{ error: {} }], [{ error: null }, { error: {} }]])('fails closed on handoff storage failure %#', async (...results) => {
    database(results)
    await expect(createWidgetHandoff(request, { userId: 'u', email: 'ada@example.com' })).rejects.toThrow()
  })
  it('atomically consumes a matching code without minting a Supabase session', async () => {
    const q = database()
    const result = await exchangeWidgetHandoff(exchange, origin)
    expect(result).toMatchObject({ displayName: 'ada', expiresAt: '2099-01-01' })
    expect(result.accessToken).toMatch(/^crrt_widget_[A-Za-z0-9_-]{43}$/)
    expect(q.update).toHaveBeenCalledWith({ token_hash: hashProof(result.accessToken) })
    for (const pair of [['code_hash', hashProof(proof)], ['state_hash', hashProof(proof)], ['pkce_challenge', pkceChallenge(proof)], ['project_key', 'project'], ['origin', origin]]) expect(q.eq).toHaveBeenCalledWith(...pair)
    expect(q.is).toHaveBeenCalledWith('token_hash', null)
    expect(q.gt).toHaveBeenCalledWith('handoff_expires_at', expect.any(String))
  })
  it.each([
    [{}, origin], [exchange, 'null'], [{ ...exchange, projectKey: 4 }, origin], [{ ...exchange, projectKey: '' }, origin],
    [{ ...exchange, code: 4 }, origin], [{ ...exchange, code: 'bad' }, origin],
    [{ ...exchange, state: 4 }, origin], [{ ...exchange, state: 'bad' }, origin],
    [{ ...exchange, verifier: 4 }, origin], [{ ...exchange, verifier: 'bad' }, origin],
  ])('rejects invalid exchange %#', async (body, value) => {
    await expect(exchangeWidgetHandoff(body, value)).rejects.toMatchObject({ status: 400 })
  })
  it('rejects reused, mismatched, expired codes and database failures', async () => {
    database([{ data: null, error: null }])
    await expect(exchangeWidgetHandoff(exchange, origin)).rejects.toMatchObject({ status: 400 })
    database([{ data: null, error: {} }])
    await expect(exchangeWidgetHandoff(exchange, origin)).rejects.toThrow('Widget exchange failed')
  })
  it('checks the opaque token hash, exact origin, expiry and current project allowlist', async () => {
    const q = database()
    expect(await requireWidgetSession(req)).toEqual(session)
    expect(q.eq).toHaveBeenCalledWith('token_hash', hashProof(`crrt_widget_${proof}`))
    expect(q.eq).toHaveBeenCalledWith('origin', origin)
    expect(q.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
  })
  it.each([{}, { authorization: 'Bearer dashboard-token', origin }, { authorization: `Bearer crrt_widget_${proof}`, origin: 'null' }])('rejects non-widget credentials %#', async (headers) => {
    await expect(requireWidgetSession({ headers } as never)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects missing/expired/revoked sessions and lookup failures', async () => {
    database([{ data: null, error: null }]); await expect(requireWidgetSession(req)).rejects.toMatchObject({ status: 401 })
    database([{ data: null, error: {} }]); await expect(requireWidgetSession(req)).rejects.toThrow('lookup failed')
  })
  it('revokes only the presented session', async () => {
    const q = database([{ data: session, error: null }, { error: null }])
    await revokeWidgetSession(req)
    expect(q.delete).toHaveBeenCalledOnce()
    database([{ data: session, error: null }, { error: {} }])
    await expect(revokeWidgetSession(req)).rejects.toThrow('sign-out failed')
  })
  it('enforces stored page origin and project, including scheme and port', () => {
    expect(() => assertWidgetPage(session, 'project', `${origin}/page`)).not.toThrow()
    for (const [project, page] of [['other', origin], ['project', 'https://app.example.com:444'], ['project', 'http://app.example.com'], ['project', 'https://other.example.com']]) {
      expect(() => assertWidgetPage(session, project, page)).toThrow('does not allow')
    }
    expect(() => assertWidgetPage(session, 'project', 'invalid')).toThrow('Invalid page URL')
  })
})

it('supports same-origin GETs without weakening exact-origin matching', async () => {
  const q = database()
  await requireWidgetSession({ headers: { authorization: `Bearer crrt_widget_${proof}`, referer: origin + '/page' } } as never)
  expect(q.eq).toHaveBeenCalledWith('origin', origin)
  for (const referer of [undefined, 'invalid', 'http://unsafe.example']) {
    await expect(requireWidgetSession({ headers: { authorization: `Bearer crrt_widget_${proof}`, referer } } as never)).rejects.toMatchObject({ status: 401 })
  }
  await expect(requireWidgetSession({ headers: { authorization: `Bearer crrt_widget_${proof}`, origin: 'null', referer: origin } } as never)).rejects.toMatchObject({ status: 401 })
})
