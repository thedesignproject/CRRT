import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createProof, hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { executeDocument, DocumentError } from '../../api/_lib/documents.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { checked, config, DASHBOARD_SCOPE, dashboardUser, ensure, hasScope, McpError, reserve, type McpIdentity } from './auth.js'
import type { ToolSpec } from './transport.js'

const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const ticket = { requestId: z.uuid(), proof }
const browserInput = z.discriminatedUnion('action', [
  z.object({ ...ticket, action: z.literal('inspect') }).strict(),
  z.object({ ...ticket, action: z.literal('approve'), password: z.string().max(128) }).strict(),
])
export const unlockInput = z.union([
  z.object({ shareKey: z.uuid(), password: z.string().max(128).optional() }).strict(),
  z.object({ requestId: z.uuid(), pollToken: proof }).strict(),
])

export function documentDashboardUrl(path: string) {
  const base = new URL(process.env.MCP_DASHBOARD_URL ?? '/dashboard/', process.env.APP_URL ?? config().origin)
  return new URL(path, new URL('./', base))
}

async function requestRow(id: string, column: string, secret: string) {
  const row = await checked(await getServiceSupabase().from('document_unlock_requests').select('*')
    .eq('id', id).eq(column, hashProof(secret)).gt('expires_at', new Date().toISOString()).maybeSingle())
  ensure(row, 404, 'unlock_request_expired')
  return row
}

async function unlock(raw: unknown, actor: McpIdentity) {
  ensure(hasScope(actor, DASHBOARD_SCOPE), 403, 'insufficient_scope')
  const input = unlockInput.parse(raw)
  if ('requestId' in input) {
    const row = await requestRow(input.requestId, 'poll_proof_hash', input.pollToken)
    ensure(row.connection_id === actor.connection_id, 403, 'forbidden')
    return row.access_token ? { status: 'approved', accessToken: row.access_token } : { status: 'pending', retryAfterSeconds: 3 }
  }
  if (input.password !== undefined) {
    const grant = await executeDocument({ action: 'unlock', ...input }, { userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id })
    return { status: 'approved', ...grant }
  }
  if (process.env.MCP_DOCUMENT_UNLOCK_METHOD === 'chat') return { status: 'password_required', method: 'chat' }
  const url = documentDashboardUrl('./document-unlock')
  const db = getServiceSupabase()
  await reserve(`document-unlock-start:${actor.connection_id}`, 10)
  const document = await checked(await db.from('documents').select('id').eq('share_key', input.shareKey)
    .eq('access_mode', 'password').eq('sharing', true).eq('archived', false).not('published_revision', 'is', null).maybeSingle())
  ensure(document, 404, 'document_not_found')
  const requestId = randomUUID(), browserProof = createProof(), pollToken = createProof()
  const expiresAt = new Date(Date.now() + 600000).toISOString()
  await checked(await db.from('document_unlock_requests').delete().eq('connection_id', actor.connection_id).lt('expires_at', new Date().toISOString()))
  await checked(await db.from('document_unlock_requests').insert({ id: requestId, document_id: document.id, connection_id: actor.connection_id,
    share_key: input.shareKey, browser_proof_hash: hashProof(browserProof), poll_proof_hash: hashProof(pollToken), expires_at: expiresAt }))
  url.hash = new URLSearchParams({ requestId, proof: browserProof }).toString()
  return { status: 'pending', method: 'browser', browserUrl: url.href, requestId, pollToken, expiresAt,
    nextAction: 'Open browserUrl in the user browser, or present it as a clickable link if browser opening is unavailable. After approval, call unlock_document with requestId and pollToken.' }
}

export const documentUnlockTool: ToolSpec = {
  name: 'unlock_document', scope: DASHBOARD_SCOPE, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  description: 'Unlock a password-protected document. If the user already supplied the password, pass shareKey and password directly; do not launch browser approval. Otherwise pass shareKey alone and follow the returned method: by default open browserUrl for the user to enter the password privately. Never ask the user to paste a password by default. Poll with requestId and pollToken after approval. Use the returned accessToken with get_document and add_document_comment, including shareKey. Grants are restricted to this MCP connection and published content; access changes invalidate them.',
  input: unlockInput, output: z.record(z.string(), z.unknown()), maxResultBytes: 16777216,
  async run(raw, actor) {
    try { return await unlock(raw, actor) }
    catch (error) { if (error instanceof DocumentError) throw new McpError(error.status, error.message); throw error }
  },
}

export async function documentUnlockHttp(request: Request): Promise<Response> {
  ensure(request.method === 'POST', 405, 'method_not_allowed')
  const user = await dashboardUser(request)
  const input = browserInput.parse(await request.json())
  const row = await requestRow(input.requestId, 'browser_proof_hash', input.proof)
  const db = getServiceSupabase()
  const connection = await checked(await db.from('mcp_connections').select('id,scope,mcp_clients(name)')
    .eq('id', row.connection_id).eq('user_id', user.id).is('revoked_at', null).maybeSingle())
  ensure(connection && hasScope({ scope: connection.scope } as McpIdentity, DASHBOARD_SCOPE), 403, 'connection_unavailable')
  if (input.action === 'inspect') return Response.json({ clientName: (connection.mcp_clients as unknown as { name: string }).name, shareKey: row.share_key,
    expiresAt: row.expires_at, status: row.access_token ? 'approved' : 'pending' })
  if (!row.access_token) {
    let grant
    try { grant = await executeDocument({ action: 'unlock', shareKey: row.share_key, password: input.password }, { userId: user.id, email: user.email!, mcpConnectionId: connection.id }) }
    catch (error) { if (error instanceof DocumentError) throw new McpError(error.status, error.message); throw error }
    const updated = await checked(await db.from('document_unlock_requests').update({ access_token: grant.accessToken })
      .eq('id', row.id).is('access_token', null).gt('expires_at', new Date().toISOString()).select('id').maybeSingle())
    ensure(updated, 409, 'unlock_request_changed')
  }
  return Response.json({ status: 'approved' })
}
