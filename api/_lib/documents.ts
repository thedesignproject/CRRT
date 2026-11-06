import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { z } from 'zod'
import { documentSchemas, type DocumentAction, type DocumentInput, type DocumentResult, type DocumentView } from '../../shared/documents.js'
import { getServiceSupabase } from './supabase.js'
import { getProjectMember } from './store.js'
import { encryptToken, decryptToken, hashToken } from './tokens.js'

export class DocumentError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export function assertDocument(value: unknown, status: number, message: string): asserts value {
  if (!value) throw new DocumentError(status, message)
}
type Actor = { userId: string; email: string; mcpConnectionId?: string } | null
const derive = promisify(scrypt)
type Row = {
  id: string
  project_id: string | null
  created_by: string
  access_mode: DocumentView['accessMode']
  title: string
  body: string
  version: number
  published_revision: number | null
  share_key: string
  sharing: boolean
  password_hash: string | null
  access_version: number
  archived: boolean
  updated_at: string
}
const failures: Record<string, number> = {
  forbidden: 403,
  version_conflict: 409,
  idempotency_conflict: 409,
  document_archived: 409,
  claim_conflict: 409,
  claim_required: 409,
  feedback_not_eligible: 409,
  document_not_found: 404,
  revision_not_found: 404,
  feedback_not_found: 404
}
async function result<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query
  if (error) {
    const code = error.message.startsWith('cloud_plan_limit') ? 'plan_limit' : error.message
    throw new DocumentError(code === 'plan_limit' ? 403 : (failures[code] ?? 503), code === 'plan_limit' || failures[code] ? code : 'document_unavailable')
  }
  return data as T
}
function view(d: Row, role: string | null): DocumentView {
  return {
    id: d.id,
    projectId: d.project_id,
    accessMode: d.access_mode,
    title: d.title,
    body: d.body,
    version: d.version,
    publishedRevision: d.published_revision,
    shareKey: d.share_key,
    sharing: d.sharing,
    passwordProtected: Boolean(d.password_hash),
    archived: d.archived,
    updatedAt: d.updated_at,
    canEdit: role === 'admin' || role === 'member',
    canPublish: role === 'admin',
    canManage: role === 'admin',
    canComment: role !== 'guest' && !d.archived && d.published_revision !== null
  }
}
async function membership(actor: NonNullable<Actor>, project: string) {
  const m = await getProjectMember(actor.userId, project)
  return m?.role ?? null
}
function issueGrant(d: Row, actor: Actor) {
  return encryptToken(JSON.stringify({ id: d.id, version: d.access_version, connectionId: actor?.mcpConnectionId, expires: Date.now() + 3600000 }))
}
function validGrant(d: Row, actor: Actor, token?: string) {
  if (d.access_mode !== 'password') return true
  try {
    const data = JSON.parse(decryptToken(token ?? ''))
    return data.id === d.id && data.version === d.access_version && data.expires > Date.now() && (!data.connectionId || data.connectionId === actor?.mcpConnectionId)
  } catch {
    return false
  }
}
export async function executeDocument(raw: unknown, actor: Actor): Promise<DocumentResult> {
  const action = z.enum(Object.keys(documentSchemas) as [DocumentAction, ...DocumentAction[]]).parse(z.object({ action: z.string() }).parse(raw).action)
  const input = documentSchemas[action].parse(raw) as DocumentInput
  let requestHash = hashToken(JSON.stringify(input))
  if (input.action === 'comment') requestHash = hashToken(JSON.stringify({ ...input, accessToken: undefined, shareKey: undefined }))
  if (input.action === 'sharing' && typeof input.password === 'string') {
    assertDocument(process.env.SHARE_TOKEN_SECRET, 503, 'document_unavailable')
    requestHash = createHmac('sha256', process.env.SHARE_TOKEN_SECRET).update(JSON.stringify(input)).digest('hex')
  }
  const db = getServiceSupabase()
  const publication = async (d: Row, fields = 'title,body') => await result<{ title: string; body?: string }>(db.from('document_revisions').select(fields).eq('document_id', d.id).eq('number', d.published_revision).single())
  const permission = async (d: Row): Promise<string | null> => {
    if (!actor) return null
    if (d.created_by === actor.userId) return 'admin'
    if (d.access_mode === 'project' && d.project_id) return membership(actor, d.project_id)
    if (d.access_mode === 'private') {
      const invite = await result(db.from('document_invites').select('email').eq('document_id', d.id).eq('email', actor.email.toLowerCase()).maybeSingle())
      if (invite) return 'reader'
    }
    return null
  }
  if (input.action === 'list') {
    assertDocument(actor, 401, 'login_required')
    let query = db
      .from('documents')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id')
      .range(input.offset, input.offset + 49)
    if (input.projectId) {
      assertDocument(await membership(actor, input.projectId), 403, 'forbidden')
      query = query.eq('project_id', input.projectId)
    }
    if (input.scope === 'mine') query = query.eq('created_by', actor.userId)
    else if (!input.projectId) {
      const [invites, memberships] = await Promise.all([
        result<{ document_id: string }[]>(db.from('document_invites').select('document_id').eq('email', actor.email.toLowerCase())),
        input.scope === 'all' ? result<{ project_key: string }[]>(db.from('project_members').select('project_key').eq('user_id', actor.userId)) : Promise.resolve([]),
      ])
      const filters = [`created_by.eq.${actor.userId}`]
      if (invites.length) filters.push(`id.in.(${invites.map((i) => i.document_id).join(',')})`)
      if (memberships.length) filters.push(`and(access_mode.eq.project,project_id.in.(${memberships.map((m) => JSON.stringify(m.project_key)).join(',')}))`)
      query = filters.length > 1 ? query.or(filters.join(',')) : query.eq('created_by', actor.userId)
    }
    const rows = await result<Row[]>(query),
      documents: DocumentView[] = []
    for (const d of rows) {
      const role = await permission(d)
      if (!role) continue
      if (role === 'guest' || role === 'reader') {
        if (d.archived || d.published_revision === null) continue
        documents.push({ ...view({ ...d, ...(await publication(d, 'title')), body: '' }, role), body: '' })
      } else documents.push({ ...view(d, role), body: '' })
    }
    return { documents, nextOffset: rows.length === 50 ? input.offset + 50 : null }
  }
  if (input.action === 'create') {
    assertDocument(actor, 401, 'login_required')
    if (input.projectId) {
      const role = await membership(actor, input.projectId)
      assertDocument(role === 'admin' || role === 'member', 403, 'forbidden')
    }
    return await result(db.rpc('document_command', { p_actor: actor.userId, p_id: input.id, p_action: 'create', p_input: input, p_key: input.key, p_hash: requestHash }))
  }
  const byShare = input.action === 'unlock' || (input.action === 'read' && input.shareKey)
  const d = await result<Row | null>(
    db
      .from('documents')
      .select('*')
      .eq(byShare ? 'share_key' : 'id', input.action === 'unlock' ? input.shareKey : input.action === 'read' && input.shareKey ? input.shareKey : input.id)
      .maybeSingle()
  )
  if (!d && input.action === 'delete' && actor) {
    const prior = await result<{ result: DocumentResult; request_hash: string } | null>(db.from('document_operations').select('result,request_hash').eq('key', `${actor.userId}:${input.id}:${input.key}`).maybeSingle())
    assertDocument(prior, 404, 'document_not_found')
    assertDocument(prior.request_hash === requestHash, 409, 'idempotency_conflict')
    return prior.result
  }
  assertDocument(d, 404, 'document_not_found')
  const role = await permission(d),
    external = !role,
    publishedOnly = external || role === 'guest' || role === 'reader' || Boolean(byShare)
  if (role === 'guest' || role === 'reader') assertDocument(!d.archived && d.published_revision !== null && ['read', 'comment'].includes(input.action), 403, 'forbidden')
  if (external) {
    assertDocument(['link', 'password'].includes(d.access_mode), actor ? 403 : 401, actor ? 'forbidden' : 'login_required')
    assertDocument(d.sharing && !d.archived && d.published_revision !== null, 404, 'document_not_found')
    assertDocument(input.action === 'read' || input.action === 'comment' || input.action === 'unlock', 403, 'forbidden')
    assertDocument(input.shareKey === d.share_key, 404, 'document_not_found')
  }
  if (input.action === 'unlock') {
    assertDocument(await result<boolean>(db.rpc('mcp_reserve', { p_key: `document-unlock:${d.id}`, p_limit: 20 })), 429, 'rate_limited')
    if (d.password_hash) {
      const [salt, expected] = d.password_hash.split(':')
      assertDocument(timingSafeEqual((await derive(input.password, salt, 32)) as Buffer, Buffer.from(expected, 'hex')), 401, 'incorrect_password')
    }
    return { accessToken: issueGrant(d, actor) }
  }
  if (external) assertDocument(validGrant(d, actor, 'accessToken' in input ? input.accessToken : undefined), 401, 'password_required')
  if (input.action === 'read') {
    assertDocument(!publishedOnly || d.published_revision !== null, 404, 'revision_not_found')
    const shown = publishedOnly ? ({ ...d, ...(await publication(d)) } as Row) : d
    let query = db
      .from('document_feedback')
      .select('id,document_id,revision,parent_id,quote,prefix,suffix,target,body,author,review_status,implementation_status,claimed_by,progress_updates,version,created_at')
      .eq('document_id', d.id)
      .order('created_at')
      .order('id')
    if (input.feedbackId) query = query.eq('id', input.feedbackId)
    else query = query.range(input.offset, input.offset + 49)
    const feedback = await result(query)
    const invites = role === 'admin' && !byShare ? await result<{ email: string }[]>(db.from('document_invites').select('email').eq('document_id', d.id)) : []
    return { document: view(shown, role), feedback: feedback as DocumentResult['feedback'], invites: invites.map((i) => i.email), nextOffset: !input.feedbackId && feedback.length === 50 ? input.offset + 50 : null }
  }
  if (input.action === 'history') {
    const revisions = await result(
      db
        .from('document_revisions')
        .select('number,title,summary,actor_id,agent_id,created_at')
        .eq('document_id', d.id)
        .order('number', { ascending: false })
        .range(input.offset, input.offset + 49)
    )
    return { revisions, nextOffset: revisions.length === 50 ? input.offset + 50 : null }
  }
  const revision = async (number: number) => {
    const r = await result(db.from('document_revisions').select('number,title,body,summary,actor_id,agent_id,created_at').eq('document_id', d.id).eq('number', number).maybeSingle())
    assertDocument(r, 404, 'revision_not_found')
    return r as NonNullable<DocumentResult['revision']>
  }
  if (input.action === 'revision') return { revision: await revision(input.revision) }
  if (input.action === 'compare') return { comparison: { before: (await revision(input.from)).body!, after: input.to ? (await revision(input.to)).body! : d.body } }
  if (input.action === 'comment') assertDocument(role !== 'guest', 403, 'forbidden')
  else {
    assertDocument(role === 'admin' || role === 'member', 403, 'forbidden')
    if (['publish', 'sharing', 'archive', 'delete', 'assign', 'invite'].includes(input.action)) assertDocument(role === 'admin', 403, 'forbidden')
  }
  const payload: Record<string, unknown> = { ...input }
  if (input.action === 'sharing') {
    const mode = input.accessMode ?? (input.sharing ? (input.password === null ? 'link' : input.password || d.password_hash ? 'password' : 'link') : 'private')
    assertDocument(mode !== 'project' || d.project_id, 400, 'invalid_request')
    assertDocument(mode !== 'password' || (input.password !== null && (input.password || d.password_hash)), 400, 'invalid_request')
    payload.accessMode = mode
    if (input.password !== undefined) {
      const salt = randomBytes(16).toString('hex')
      payload.passwordHash = input.password === null ? null : `${salt}:${((await derive(input.password, salt, 32)) as Buffer).toString('hex')}`
      delete payload.password
    }
  }
  if (input.action === 'comment') {
    assertDocument(await result(db.rpc('mcp_reserve', { p_key: `document-comments:${d.id}`, p_limit: 60 })), 429, 'rate_limited')
    if (actor) payload.author = actor.email.slice(0, 100)
  }
  return await result(db.rpc('document_command', { p_actor: actor?.userId ?? null, p_id: d.id, p_action: input.action, p_input: payload, p_key: input.key, p_hash: requestHash, p_access: external ? d.access_version : null }))
}
