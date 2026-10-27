import { z } from 'zod'
import { createProof, hashProof, pkceChallenge } from '../../api/_lib/extension-auth-contracts.js'
import { getNonPersistentSupabase, getServiceSupabase } from '../../api/_lib/supabase.js'

export const SCOPE = 'crrt:read'
export const SCOPES = [SCOPE, 'crrt:implement', 'crrt:review'] as const
export const ALL_SCOPES = SCOPES.join(' ')
export function normalizeScope(raw: string) {
  const scopes = raw.split(' ')
  ensure(scopes.includes(SCOPE) && scopes.every(scope => (SCOPES as readonly string[]).includes(scope)), 400, 'invalid_scope')
  return SCOPES.filter(scope => scopes.includes(scope)).join(' ')
}
const scopeSchema = z.string().transform(normalizeScope)
export class McpError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
export function ensure(ok: unknown, status: number, code: string): asserts ok {
  if (!ok) throw new McpError(status, code)
}
export function config() {
  const previewOrigin = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : undefined
  const origin = z.url().parse(process.env.MCP_ORIGIN ?? process.env.APP_URL ?? previewOrigin)
  const url = new URL(origin)
  ensure(url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 503, 'invalid_origin')
  ensure(url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:'), 503, 'https_required')
  return { origin: url.origin, resource: `${url.origin}/api/mcp/v1` }
}
export const uuid = z.uuid()
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const token = z.string().regex(/^crrt_mcp_[A-Za-z0-9_-]{43}$/)
const newToken = () => `crrt_mcp_${createProof()}`
export async function checked<T>(result: { data: T; error: unknown }): Promise<T> {
  ensure(!result.error, 503, 'storage_unavailable')
  return result.data
}
function callback(raw: string) {
  const url = new URL(z.url().max(2048).parse(raw))
  // Native clients finish OAuth on their own loopback listener. This is safe
  // in production too: callbacks remain registered exactly and PKCE-bound.
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname)
  const local = url.protocol === 'http:' && (loopback || (process.env.NODE_ENV !== 'production' && url.hostname === 'localhost'))
  const trusted = (process.env.MCP_CALLBACK_ORIGINS ?? '').split(',').includes(url.origin)
  ensure(!url.username && !url.password && !url.hash && (local || (url.protocol === 'https:' && trusted)), 400, 'invalid_redirect_uri')
  return raw
}
async function client(id: string) {
  const row = await checked(await getServiceSupabase().from('mcp_clients').select('id,name,redirect_uris').eq('id', uuid.parse(id)).is('revoked_at', null).maybeSingle())
  ensure(row, 400, 'invalid_client')
  return row
}
const authorization = z.object({
  client_id: uuid, redirect_uri: z.string(), response_type: z.literal('code'),
  code_challenge: proof, code_challenge_method: z.literal('S256'),
  state: z.string().min(1).max(1024), scope: scopeSchema.default(ALL_SCOPES), resource: z.string(),
})
export async function authorize(input: unknown) {
  const params = authorization.parse(input)
  ensure(params.resource === config().resource, 400, 'invalid_target')
  const app = await client(params.client_id)
  ensure(app.redirect_uris.includes(callback(params.redirect_uri)), 400, 'invalid_redirect_uri')
  return { params, name: app.name as string }
}
export type McpIdentity = { user_id: string; email: string; connection_id: string; scope?: string }
export function hasScope(actor: McpIdentity, scope: string) { return (actor.scope ?? SCOPE).split(' ').includes(scope) }
export async function identity(header: string | null): Promise<McpIdentity> {
  ensure(header && header.startsWith('Bearer '), 401, 'invalid_token')
  const parsed = token.safeParse(header.slice(7))
  ensure(parsed.success, 401, 'invalid_token')
  const rows = await checked(await getServiceSupabase().rpc('mcp_identity', { p_hash: hashProof(parsed.data), p_resource: config().resource })) as McpIdentity[]
  ensure(rows.length === 1, 401, 'invalid_token')
  return rows[0]
}
async function dashboardUser(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  ensure(/^Bearer \S+$/.test(value), 401, 'login_required')
  const { data, error } = await getNonPersistentSupabase().auth.getUser(value.slice(7))
  ensure(!error && data.user?.email, 401, 'login_required')
  return data.user
}
export async function reserve(key: string, limit: number) {
  ensure(await checked(await getServiceSupabase().rpc('mcp_reserve', { p_key: key, p_limit: limit })), 429, 'rate_limited')
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }) }
export function authFailure(error: unknown) {
  const failure = error instanceof McpError ? error : new McpError(error instanceof z.ZodError ? 400 : 503, error instanceof z.ZodError ? 'invalid_request' : 'temporarily_unavailable')
  return json({ error: failure.code }, failure.status)
}
export async function oauth(request: Request): Promise<Response> {
  try {
    const { origin, resource } = config()
    const url = new URL(request.url)
    const action = url.pathname.split('/').pop()
    if (request.method === 'GET' && action === 'metadata') return json({
      issuer: origin, authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`, registration_endpoint: `${origin}/api/mcp/oauth/register`,
      revocation_endpoint: `${origin}/api/mcp/oauth/revoke`, scopes_supported: SCOPES,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    })
    if (request.method === 'GET' && action === 'resource') return json({ resource, authorization_servers: [origin], scopes_supported: SCOPES, bearer_methods_supported: ['header'] })
    if (request.method === 'GET' && action === 'authorize') {
      const { params } = await authorize(Object.fromEntries(url.searchParams))
      const dashboard = new URL(process.env.MCP_DASHBOARD_URL ?? `${origin}/dashboard/mcp-auth`)
      ensure(dashboard.pathname.endsWith('/dashboard/mcp-auth') && !dashboard.search && !dashboard.hash, 503, 'invalid_dashboard')
      dashboard.search = new URLSearchParams(params).toString()
      return new Response(null, { status: 302, headers: { Location: dashboard.href, 'Cache-Control': 'no-store' } })
    }
    ensure(request.method === 'POST', 405, 'method_not_allowed')
    ensure(Number(request.headers.get('content-length') ?? 0) <= 16384, 413, 'request_too_large')
    const raw = await request.text()
    ensure(Buffer.byteLength(raw) <= 16384, 413, 'request_too_large')
    const input = request.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))
    if (action === 'register') {
      const data = z.object({ client_name: z.string().trim().min(1).max(100), redirect_uris: z.array(z.string()).min(1).max(5), token_endpoint_auth_method: z.literal('none').default('none'), grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(), response_types: z.array(z.literal('code')).optional(), scope: scopeSchema.default(ALL_SCOPES) }).parse(input)
      data.redirect_uris.forEach(callback)
      // One shared budget bounds anonymous registration across API instances.
      await reserve('register', 20)
      const row = await checked(await getServiceSupabase().from('mcp_clients').insert({ name: data.client_name, redirect_uris: data.redirect_uris }).select('id').single())
      ensure(row, 503, 'storage_unavailable')
      return json({ ...data, client_id: row.id }, 201)
    }
    if (action === 'consent') {
      const user = await dashboardUser(request)
      await reserve(`consent:${user.id}`, 30)
      const { params, name } = await authorize(input)
      if (input.decision === 'inspect') return json({ name, scope: params.scope, redirectUri: params.redirect_uri })
      ensure(['approve', 'deny'].includes(input.decision), 400, 'invalid_request')
      const redirect = new URL(params.redirect_uri)
      redirect.searchParams.set('state', params.state)
      redirect.searchParams.set('iss', origin)
      if (input.decision === 'deny') redirect.searchParams.set('error', 'access_denied')
      else {
        const code = createProof()
        await checked(await getServiceSupabase().from('mcp_codes').insert({
          hash: hashProof(code), state_hash: hashProof(params.state), challenge: params.code_challenge,
          user_id: user.id, client_id: params.client_id, redirect_uri: params.redirect_uri,
          resource, scope: params.scope, expires_at: new Date(Date.now() + 299000).toISOString(),
        }))
        redirect.searchParams.set('code', code)
      }
      return json({ redirectUrl: redirect.href })
    }
    if (action === 'connections') {
      const user = await dashboardUser(request)
      if (input.connectionId) {
        await checked(await getServiceSupabase().from('mcp_connections').update({ revoked_at: new Date().toISOString() }).eq('id', uuid.parse(input.connectionId)).eq('user_id', user.id))
      }
      const rows = await checked(await getServiceSupabase().from('mcp_connections').select('id,created_at,expires_at,scope,mcp_clients(name)').eq('user_id', user.id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50))
      return json({ connections: rows })
    }
    ensure(action === 'token' || action === 'revoke', 404, 'not_found')
    const app = await client(input.client_id)
    // Public client IDs must never select a victim's quota. Admit only known
    // credential proofs; transactional RPCs remain the authorization authority.
    // Revocation stays idempotent and cannot be starved by a token quota.
    if (action === 'revoke') {
      await checked(await getServiceSupabase().rpc('mcp_revoke', { p_hash: hashProof(token.parse(input.token)), p_client: app.id }))
      return json({})
    }
    ensure(input.resource === resource, 400, 'invalid_target')
    const access = newToken(), refresh = newToken()
    const args = { p_client: app.id, p_resource: resource, p_access: hashProof(access), p_refresh: hashProof(refresh) }
    let connection: unknown, grantedScope: string
    if (input.grant_type === 'authorization_code') {
      const verifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).parse(input.code_verifier)
      const hash = hashProof(proof.parse(input.code)), challenge = pkceChallenge(verifier), redirect = callback(input.redirect_uri)
      const grant = await checked(await getServiceSupabase().from('mcp_codes').select('hash,scope').eq('hash', hash).eq('client_id', app.id).eq('challenge', challenge).maybeSingle())
      ensure(grant, 400, 'invalid_grant')
      grantedScope = normalizeScope(z.string().parse(grant.scope))
      await reserve(`exchange:${hash}`, 120)
      connection = await checked(await getServiceSupabase().rpc('mcp_exchange', {
        ...args, p_hash: hash, p_redirect: redirect, p_challenge: challenge,
      }))
    } else {
      ensure(input.grant_type === 'refresh_token', 400, 'unsupported_grant_type')
      const hash = hashProof(token.parse(input.refresh_token))
      const grant = await checked(await getServiceSupabase().from('mcp_credentials').select('hash,mcp_connections!inner(client_id,scope)').eq('hash', hash).eq('kind', 'refresh').eq('mcp_connections.client_id', app.id).maybeSingle())
      ensure(grant, 400, 'invalid_grant')
      grantedScope = normalizeScope(z.object({ scope: z.string() }).parse(grant.mcp_connections).scope)
      await reserve(`refresh:${hash}`, 120)
      connection = await checked(await getServiceSupabase().rpc('mcp_refresh', { ...args, p_hash: hash }))
    }
    ensure(connection, 400, 'invalid_grant')
    const issued = await checked(await getServiceSupabase().from('mcp_credentials').select('expires_at').eq('hash', args.p_access).maybeSingle())
    const expiresAt = issued?.expires_at
    ensure(typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)), 503, 'storage_unavailable')
    const expiresIn = Math.max(0, Math.min(900, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)))
    return json({ access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: expiresIn, scope: grantedScope })
  } catch (error) { return authFailure(error) }
}
