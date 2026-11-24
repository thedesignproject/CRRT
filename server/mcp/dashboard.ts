import { z } from 'zod'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { DASHBOARD_SCOPE, checked, config, ensure, hasScope, uuid } from './auth.js'
import { dashboardOperations, isDashboardRead, type DashboardOperation } from './dashboard-operations.js'
import { runDashboardOperation } from './dashboard-adapter.js'
import { requestDashboardAccess } from './dashboard-access.js'
import type { ToolSpec } from './transport.js'

const userRequested = z.literal(true).optional().describe('Set to true when the user asked for this change. Required for changes.')
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).optional().describe('A unique key for this request (16-128 letters, digits, - or _). Required for changes. Reuse it only to retry the identical request.')
const resultPage = z.object({ field: z.string().min(1).max(100).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(20) }).strict().optional()
  .describe('Returns one page of a large array result. Set field to the array path (such as comments or payload.transcript), or omit it when the result is an array.')

function inputFor(operation: DashboardOperation) {
  const query = Object.fromEntries(operation.query.map(key => {
    const value = z.string().max(4000)
    return [key, operation.required.includes(key) ? value.min(1) : value.optional()]
  }))
  const read = isDashboardRead(operation)
  return z.object({
    ...query, ...operation.body,
    ...(read ? {} : { userRequested }),
    ...(operation.method === 'GET' ? {} : { idempotencyKey }),
    ...(read ? { resultPage } : {}),
  }).strict()
}

function page(data: unknown, { field, offset, limit }: { field?: string; offset: number; limit: number }) {
  const items = field ? field.split('.').reduce<unknown>((value, key) => value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined, data) : data
  ensure(Array.isArray(items), 400, 'array_result_required')
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null }
}

function toolFor(operation: DashboardOperation): ToolSpec {
  const input = inputFor(operation)
  const read = isDashboardRead(operation)
  return {
    name: operation.tool, title: operation.title, description: operation.description,
    ...(operation.superAdmin ? { superAdmin: true } : {}),
    annotations: { readOnlyHint: read, destructiveHint: operation.destructive, idempotentHint: operation.method === 'GET', openWorldHint: operation.openWorld },
    input, output: z.record(z.string(), z.unknown()),
    async run(raw, actor) {
      const parsed = input.parse(raw) as Record<string, unknown>
      if (!read) ensure(parsed.userRequested, 403, 'human_request_required')
      if (operation.method !== 'GET') ensure(parsed.idempotencyKey, 400, 'idempotency_key_required')
      if (!hasScope(actor, DASHBOARD_SCOPE)) return { ok: false, code: 'permission_upgrade_required', retryable: false, ...await requestDashboardAccess(actor) }
      await checked(await getServiceSupabase().rpc('mcp_require_connection', { p_connection: actor.connection_id, p_actor: actor.user_id, p_scope: DASHBOARD_SCOPE }))
      const query: Record<string, string> = {}, body: Record<string, unknown> = {}
      for (const key of operation.query) if (parsed[key] !== undefined) query[key] = parsed[key] as string
      for (const key of Object.keys(operation.body)) if (parsed[key] !== undefined) body[key] = parsed[key]
      const result = await runDashboardOperation(operation, query, body, actor, parsed.idempotencyKey as string | undefined)
      const requestedPage = parsed.resultPage as Parameters<typeof page>[1] | undefined
      if (requestedPage && result.ok) return { operation: operation.tool, ...result, data: page(result.data, requestedPage) }
      return { operation: operation.tool, ...result }
    },
  }
}

export const dashboardTools: ToolSpec[] = [...dashboardOperations.map(toolFor), {
  name: 'manage_mcp_connections', scope: 'crrt:dashboard', title: 'Manage MCP connections',
  description: 'List your active CRRT MCP connections, or revoke one by ID. Revoking takes effect immediately and does not sign you out of the dashboard.',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({ revokeConnectionId: uuid.optional(), userRequested: z.literal(true).optional() }).strict(), output: z.record(z.string(), z.unknown()),
  async run(raw, actor) {
    ensure(hasScope(actor, DASHBOARD_SCOPE), 403, 'insufficient_scope')
    const parsed = z.object({ revokeConnectionId: uuid.optional(), userRequested: z.literal(true).optional() }).strict().parse(raw)
    if (parsed.revokeConnectionId) {
      ensure(parsed.userRequested, 403, 'human_request_required')
      await checked(await getServiceSupabase().from('mcp_connections').update({ revoked_at: new Date().toISOString() }).eq('id', parsed.revokeConnectionId).eq('user_id', actor.user_id))
    }
    const connections = await checked(await getServiceSupabase().from('mcp_connections').select('id,created_at,expires_at,scope,mcp_clients(name)').eq('user_id', actor.user_id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50))
    return { connections, accountSettingsUrl: `${config().origin}/dashboard/mcp-auth` }
  },
}]
