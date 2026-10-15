import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { waitUntil } from '@vercel/functions'
import { requireUser, type AuthenticatedUser } from './auth.js'
import { createProof, hashProof } from './extension-auth-contracts.js'
import { getServiceSupabase } from './supabase.js'
import { mapComment, getProject, getProjectMember } from './store.js'
import { resolveWidgetAgentAccess } from './billing/agent-entitlement.js'
import { parsePlanFailure, PLAN_MESSAGES } from './billing/plan-errors.js'
import { assertWidgetPage, assertWidgetProject, createWidgetHandoff, exchangeWidgetHandoff, requireWidgetSession, WidgetSessionError } from './widget-session.js'
import { widgetOrigin } from '../../src/lib/widgetAuthContract.js'
import { notifyProjectMembersOfCommentActivityInBackground, sendCommentActivityEmailInBackground } from './comment-activity.js'

const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const id = z.uuid()
const codeInput = z.object({ code: proof })
const claimInput = codeInput.extend({
  storybookVersion: z.string().min(1).max(80), addonVersion: z.string().min(1).max(80),
  packageManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']),
})
const feedbackInput = z.object({
  projectKey: z.string().min(1).max(200), pageUrl: z.url().max(2048),
  selector: z.string().regex(/^storybook:\/\/[A-Za-z0-9_-]+$/).max(1000),
  x: z.number().finite(), y: z.number().finite(), body: z.string().trim().min(1).max(8000),
})
type Connection = { id: string; project_key: string; created_by: string; expires_at: string; claimed_at: string | null; revoked_at: string | null }
const columns = 'id,project_key,created_by,expires_at,claimed_at,revoked_at'
class StorybookError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new StorybookError(400, 'invalid_request', 'Invalid Storybook request')
  return result.data
}
function failAccess() { throw new StorybookError(403, 'access_denied', 'This project is unavailable to your account') }
function databaseError(error: { message: string } | null) {
  if (!error) return
  const code = error.message
  if (code === 'invalid_pairing') throw new StorybookError(400, code, 'Generate a new Storybook connection code in CRRT')
  if (code === 'session_expired') throw new StorybookError(419, code, 'Sign in to CRRT again')
  if (code === 'forbidden' || code === 'access_denied') failAccess()
  throw new Error(error.message)
}
function deployment() {
  const origin = widgetOrigin(process.env.APP_URL)
  if (!origin) throw new Error('APP_URL must be a trusted HTTP localhost or HTTPS origin')
  return { apiBase: `${origin}/api`, dashboardUrl: origin }
}
async function feedbackMember(projectKey: string, userId: string) {
  const member = await getProjectMember(userId, projectKey)
  if (!member || member.feedbackAllowed === false) failAccess()
  return member!
}
async function ownerAccess(projectKey: string, userId: string) {
  const member = await feedbackMember(projectKey, userId)
  if (!member.isOwner) failAccess()
  await agentAccess(projectKey, userId)
}
async function agentAccess(projectKey: string, userId: string) {
  const access = await resolveWidgetAgentAccess(projectKey, userId)
  if (access.state !== 'ready') {
    const status = { project_access_denied: 403, forbidden: 403, upgrade_required: 402, owner_upgrade_required: 402, seat_limit_reached: 409 }[access.state]
    throw new StorybookError(status, access.state, 'Open CRRT to manage project access or the project plan')
  }
  return access
}
async function connection(connectionId: unknown) {
  const key = parse(id, connectionId)
  const { data, error } = await getServiceSupabase().from('storybook_connections').select(columns).eq('id', key).maybeSingle()
  databaseError(error)
  if (!data || !data.claimed_at || data.revoked_at) failAccess()
  return data as Connection
}
async function browserSession(req: VercelRequest, row: Connection) {
  try {
    const session = await requireWidgetSession(req, row.id)
    if (session.project_key !== row.project_key) failAccess()
    await feedbackMember(row.project_key, session.user_id)
    return session
  } catch (error) {
    if (error instanceof WidgetSessionError && error.status === 401) {
      // Distinguish a known, expired credential without accepting it as authority.
      const { data, error: lookupError } = await getServiceSupabase().from('widget_auth_sessions').select('expires_at')
        .eq('token_hash', hashProof(String(req.headers.authorization).slice(7))).eq('storybook_connection_id', row.id)
        .eq('origin', req.headers.origin).maybeSingle()
      databaseError(lookupError)
      if (data && Date.parse(data.expires_at) <= Date.now()) throw new StorybookError(419, 'session_expired', 'Sign in to CRRT again')
      throw new StorybookError(401, 'authentication_required', 'Sign in to CRRT to send feedback')
    }
    throw error
  }
}
async function createPairing(req: VercelRequest, user: AuthenticatedUser) {
  const { projectKey } = parse(z.object({ projectKey: z.string().min(1).max(200) }), req.body)
  await ownerAccess(projectKey, user.userId)
  const code = createProof()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString()
  const { data, error } = await getServiceSupabase().from('storybook_connections').insert({
    project_key: projectKey, created_by: user.userId, code_hash: hashProof(code), created_at: now.toISOString(), expires_at: expiresAt,
  }).select('id').single()
  databaseError(error)
  return { code, expiresAt, connectionId: data!.id }
}
async function pairing(req: VercelRequest, claim: boolean) {
  const input = parse(claim ? claimInput : codeInput, req.body)
  const hash = hashProof(input.code)
  const { data, error } = await getServiceSupabase().from('storybook_connections').select(columns)
    .eq('code_hash', hash).gt('expires_at', new Date().toISOString()).is('revoked_at', null).maybeSingle()
  databaseError(error)
  if (!data) throw new StorybookError(400, 'invalid_pairing', 'Generate a new Storybook connection code in CRRT')
  const row = data as Connection
  await ownerAccess(row.project_key, row.created_by)
  if (!claim) return { valid: true, expiresAt: row.expires_at }
  // Resolve trusted deployment configuration before consuming the code.
  const urls = deployment()
  const { code: _code, ...client } = input
  const claimed = await getServiceSupabase().rpc('claim_storybook_pairing', { p_hash: hash, p_client: client }).single()
  databaseError(claimed.error)
  const claimedRow = claimed.data as Connection
  return { connectionId: claimedRow.id, projectKey: claimedRow.project_key, ...urls }
}
async function handoff(req: VercelRequest, user: AuthenticatedUser) {
  const { connectionId, origin, state, codeChallenge } = parse(z.object({ connectionId: id, origin: z.string(), state: proof, codeChallenge: proof }), req.body)
  const row = await connection(connectionId)
  await feedbackMember(row.project_key, user.userId)
  return createWidgetHandoff({ projectKey: row.project_key, origin, state, codeChallenge }, user, row.id)
}
async function exchange(req: VercelRequest) {
  const input = parse(z.object({ connectionId: id, code: proof, state: proof, verifier: proof }), req.body)
  const row = await connection(input.connectionId)
  return exchangeWidgetHandoff({ ...input, projectKey: row.project_key }, req.headers.origin, row.id)
}
async function eligibility(req: VercelRequest) {
  const row = await connection(req.query.connectionId)
  const session = await browserSession(req, row)
  const access = await agentAccess(row.project_key, session.user_id)
  return { state: access.state, role: access.role, collaboratorSeatLimit: access.collaboratorSeatLimit }
}
async function comments(req: VercelRequest) {
  const input = parse(feedbackInput, req.body)
  const row = await connection(req.query.connectionId)
  const session = await browserSession(req, row)
  assertWidgetPage(session, input.projectKey, input.pageUrl)
  // Verify that the selector and deep link identify the same story.
  const page = new URL(input.pageUrl)
  if (page.searchParams.get('path') !== `/story/${input.selector.slice('storybook://'.length)}`) {
    throw new StorybookError(400, 'invalid_request', 'Story deep link and selector must match')
  }
  await assertWidgetProject(row.project_key, session.origin)
  const result = await getServiceSupabase().rpc('create_storybook_comment_snapshot', {
    p_connection: row.id, p_actor: session.user_id, p_origin: session.origin,
    p_token_hash: hashProof((req.headers.authorization as string).slice(7)),
    p_comment: { ...input, authorName: session.display_name },
  }).single()
  databaseError(result.error)
  const comment = mapComment(result.data as Parameters<typeof mapComment>[0])
  const project = await getProject(row.project_key)
  if (!project) failAccess()
  const activity = { projectKey: row.project_key, projectName: project!.name, commentId: comment.id, pageUrl: input.pageUrl, authorName: session.display_name }
  waitUntil(notifyProjectMembersOfCommentActivityInBackground(activity))
  waitUntil(sendCommentActivityEmailInBackground(activity))
  return comment
}
async function manage(req: VercelRequest, user: AuthenticatedUser) {
  const { projectKey } = parse(z.object({ projectKey: z.string().min(1).max(200) }), req.query)
  const connectionId = req.method === 'GET' ? null : parse(id, req.query.connectionId)
  const result = await getServiceSupabase().rpc('manage_storybook_connections', {
    p_project: projectKey, p_actor: user.userId, p_connection: connectionId,
  })
  databaseError(result.error)
  return result.data
}

const operations = {
  create: { methods: ['POST'], authenticated: true, run: createPairing, status: 201 },
  validate: { methods: ['POST'], authenticated: false, run: (req: VercelRequest) => pairing(req, false), status: 200 },
  claim: { methods: ['POST'], authenticated: false, run: (req: VercelRequest) => pairing(req, true), status: 200 },
  handoff: { methods: ['POST'], authenticated: true, run: handoff, status: 201 },
  exchange: { methods: ['POST'], authenticated: false, run: exchange, status: 200 },
  eligibility: { methods: ['GET'], authenticated: false, run: eligibility, status: 200 },
  comments: { methods: ['POST'], authenticated: false, run: comments, status: 201 },
  manage: { methods: ['GET', 'DELETE'], authenticated: true, run: manage, status: 200 },
} as const
export function storybookHandler(operation: keyof typeof operations) {
  const config = operations[operation]
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Vary', 'Origin')
    // Credentialed requests need an exact origin. Authentication uses scoped
    // bearer tokens, not ambient cookies; never enable credentials here.
    const origin = widgetOrigin(req.headers.origin)
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', [...config.methods, 'OPTIONS'].join(', '))
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    try {
      if (req.headers.origin !== undefined && !origin) throw new StorybookError(403, 'access_denied', 'Invalid request origin')
      if (['eligibility', 'comments', 'exchange'].includes(operation) && !origin) throw new StorybookError(403, 'access_denied', 'A browser origin is required')
      if (req.method === 'OPTIONS') return res.status(204).end()
      if (!(config.methods as readonly string[]).includes(req.method!)) return res.status(405).json({ code: 'method_not_allowed', message: 'Method not allowed' })
      let user: AuthenticatedUser | null = null
      if (config.authenticated) {
        // Preserve exact-origin CORS even when requireUser writes an error.
        const authResponse = {
          setHeader: () => res,
          status: (status: number) => ({ json: (body: { error: string }) => res.status(status).json({ code: 'authentication_required', message: body.error }) }),
        } as unknown as VercelResponse
        user = await requireUser(req, authResponse)
        if (!user) return
      }
      return res.status(config.status).json(await config.run(req, user!))
    } catch (error) {
      const plan = parsePlanFailure(error)
      if (plan) return res.status(plan.resource === 'subscription' ? 402 : 409).json({ ...plan, message: PLAN_MESSAGES[plan.resource] })
      if (error instanceof StorybookError) return res.status(error.status).json({ state: error.code, code: error.code, message: error.message })
      if (error instanceof WidgetSessionError) return res.status(error.status).json({ code: 'access_denied', message: error.message })
      return res.status(500).json({ code: 'error', message: 'Storybook is temporarily unavailable' })
    }
  }
}
