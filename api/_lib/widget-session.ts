import type { VercelRequest } from '@vercel/node'
import { createProof, hashProof, pkceChallenge } from './extension-auth-contracts.js'
import { getServiceSupabase } from './supabase.js'
import { getProject } from './store.js'
import { isHostnameAllowed } from './origins.js'
import { parseWidgetAuthRequest, WIDGET_PROOF, widgetOrigin, type WidgetAuthRequest } from '../../src/lib/widgetAuthContract.js'

export class WidgetSessionError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export type WidgetSession = { user_id: string; project_key: string; origin: string; display_name: string; expires_at: string }
const SESSION_COLUMNS = 'user_id, project_key, origin, display_name, expires_at'

export async function assertWidgetProject(projectKey: string, origin: string) {
  const project = await getProject(projectKey)
  if (!project || !isHostnameAllowed(new URL(origin).hostname, project.allowedOrigins)) {
    throw new WidgetSessionError(403, 'Website is not allowed for this project')
  }
}

export async function createWidgetHandoff(input: Partial<WidgetAuthRequest>, user: { userId: string; email: string }) {
  const request = parseWidgetAuthRequest(input)
  if (!request) throw new WidgetSessionError(400, 'Invalid widget sign-in request')
  await assertWidgetProject(request.projectKey, request.origin)
  const code = createProof()
  const now = Date.now()
  const db = getServiceSupabase()
  const cleanup = await db.from('widget_auth_sessions').delete().lt('expires_at', new Date(now).toISOString())
  if (cleanup.error) throw new Error('Widget session cleanup failed')
  const { error } = await db.from('widget_auth_sessions').insert({
    code_hash: hashProof(code), state_hash: hashProof(request.state), pkce_challenge: request.codeChallenge,
    user_id: user.userId, project_key: request.projectKey, origin: request.origin,
    display_name: user.email.split('@')[0],
    handoff_expires_at: new Date(now + 5 * 60_000).toISOString(),
    expires_at: new Date(now + 60 * 60_000).toISOString(),
  })
  if (error) throw new Error('Widget handoff creation failed')
  return { code, state: request.state }
}

export async function exchangeWidgetHandoff(input: Record<string, unknown>, origin: unknown) {
  const { code, state, verifier, projectKey } = input
  if (!widgetOrigin(origin) || typeof projectKey !== 'string' || !projectKey
    || typeof code !== 'string' || !WIDGET_PROOF.test(code)
    || typeof state !== 'string' || !WIDGET_PROOF.test(state)
    || typeof verifier !== 'string' || !WIDGET_PROOF.test(verifier)) {
    throw new WidgetSessionError(400, 'Invalid widget exchange')
  }
  await assertWidgetProject(projectKey, origin as string)
  const token = `crrt_widget_${createProof()}`
  // Postgres rechecks the token_hash predicate after concurrent updates: one winner.
  const { data, error } = await getServiceSupabase().from('widget_auth_sessions')
    .update({ token_hash: hashProof(token) }).eq('code_hash', hashProof(code))
    .eq('state_hash', hashProof(state)).eq('pkce_challenge', pkceChallenge(verifier))
    .eq('project_key', projectKey).eq('origin', origin).is('token_hash', null)
    .gt('handoff_expires_at', new Date().toISOString()).select(SESSION_COLUMNS).maybeSingle()
  if (error) throw new Error('Widget exchange failed')
  if (!data) throw new WidgetSessionError(400, 'Invalid or expired widget sign-in')
  return { accessToken: token, displayName: data.display_name, expiresAt: data.expires_at }
}

function requestOrigin(req: VercelRequest): string | null {
  if (req.headers.origin !== undefined) return widgetOrigin(req.headers.origin)
  // Same-origin GETs can omit Origin. Referer is checked against the same
  // exact credential origin; it is never used as authentication on its own.
  if (typeof req.headers.referer !== 'string') return null
  try { return widgetOrigin(new URL(req.headers.referer).origin) } catch { return null }
}

export async function requireWidgetSession(req: VercelRequest): Promise<WidgetSession> {
  const authorization = req.headers.authorization
  const origin = requestOrigin(req)
  if (typeof authorization !== 'string' || !/^Bearer crrt_widget_[A-Za-z0-9_-]{43}$/.test(authorization)
    || !origin) throw new WidgetSessionError(401, 'Sign in to CRRT again')
  const { data, error } = await getServiceSupabase().from('widget_auth_sessions')
    .select(SESSION_COLUMNS).eq('token_hash', hashProof(authorization.slice(7)))
    .eq('origin', origin).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) throw new Error('Widget session lookup failed')
  if (!data) throw new WidgetSessionError(401, 'Sign in to CRRT again')
  await assertWidgetProject(data.project_key, data.origin)
  return data as WidgetSession
}

export async function revokeWidgetSession(req: VercelRequest) {
  await requireWidgetSession(req)
  const { error } = await getServiceSupabase().from('widget_auth_sessions').delete()
    .eq('token_hash', hashProof((req.headers.authorization as string).slice(7)))
  if (error) throw new Error('Widget sign-out failed')
}

export function assertWidgetPage(session: WidgetSession, projectKey: string, pageUrl: string) {
  let origin: string
  try { origin = new URL(pageUrl).origin } catch { throw new WidgetSessionError(400, 'Invalid page URL') }
  if (session.project_key !== projectKey || session.origin !== origin) {
    throw new WidgetSessionError(403, 'Widget session does not allow this project or page')
  }
}
