import { z } from 'zod'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { ALL_SCOPES, DASHBOARD_BUNDLE, DASHBOARD_SCOPE, checked, config, ensure, hasScope, uuid, type McpIdentity } from './auth.js'
import type { ToolSpec } from './transport.js'

export async function requestDashboardAccess(actor: McpIdentity) {
  if (hasScope(actor, DASHBOARD_SCOPE)) return { state: 'approved', bundle: DASHBOARD_BUNDLE }
  const request = z.object({ id: uuid, expires_at: z.string() }).parse(await checked(await getServiceSupabase().rpc('mcp_request_dashboard_upgrade', { p_connection: actor.connection_id, p_actor: actor.user_id })))
  const url = new URL(process.env.MCP_DASHBOARD_URL ?? `${config().origin}/dashboard/mcp-auth`)
  url.search = new URLSearchParams({ upgrade: request.id }).toString()
  return { state: 'pending', bundle: DASHBOARD_BUNDLE, requestId: request.id, approvalUrl: url.href, expiresAt: request.expires_at,
    action: 'Explain that one approval enables the full dashboard suite. Open approvalUrl once in the system browser if supported, otherwise provide the link. Check request_dashboard_access with requestId after approval; preserve the original task. Do not reinstall, disconnect, or repeat setup.' }
}

const statusInput = z.object({ requestId: uuid.optional() }).strict()
export const dashboardAccessTools: ToolSpec[] = [{
  name: 'connection_status',
  description: 'Inspect this CRRT connection and its approved permissions before dashboard operations. Connection does not imply an editing executor is online. Existing MCP configuration remains reusable.',
  input: z.object({}).strict(), output: z.record(z.string(), z.unknown()),
  async run(_input, actor) {
    return { connectionId: actor.connection_id, scopes: (actor.scope ?? 'crrt:read').split(' '), dashboardBundle: hasScope(actor, DASHBOARD_SCOPE) ? DASHBOARD_BUNDLE : null,
      dashboardAccess: hasScope(actor, DASHBOARD_SCOPE) ? 'approved' : 'upgrade_required', executorReadiness: 'not_established',
      nextAction: 'Use request_dashboard_access for one full-suite approval if needed. Use list_dashboard_operations to discover actions; writes require the user request and current dashboard permissions.' }
  },
}, {
  name: 'request_dashboard_access',
  description: 'Request one permission upgrade for the complete dashboard suite, or inspect an existing requestId. Works with old read-only connections. Approval preserves the connection/configuration and includes all dashboard-v1 operations, subject to actual roles/plans. Never repeat successful setup. If the client caches tools, use its supported refresh or explain any required reload without promising automatic continuation.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: statusInput, output: z.record(z.string(), z.unknown()),
  async run(raw, actor) {
    const input = statusInput.parse(raw)
    if (!input.requestId) return requestDashboardAccess(actor)
    const request = await checked(await getServiceSupabase().from('mcp_permission_upgrades').select('state,bundle,expires_at').eq('id', input.requestId).eq('connection_id', actor.connection_id).maybeSingle())
    ensure(request, 404, 'upgrade_unavailable')
    return { requestId: input.requestId, state: request.state === 'pending' && Date.parse(request.expires_at) <= Date.now() ? 'expired' : request.state,
      bundle: request.bundle, expiresAt: request.expires_at, granted: hasScope(actor, DASHBOARD_SCOPE),
      action: 'After approval, retry the original requested action with the same idempotency key, refreshing its state/version first. Decline or expiry leaves prior permissions unchanged.' }
  },
}]

export async function decideDashboardAccess(input: unknown, actorId: string) {
  const data = z.object({ requestId: uuid, decision: z.enum(['inspect', 'approve', 'deny']) }).strict().parse(input)
  const result = await getServiceSupabase().rpc('mcp_decide_dashboard_upgrade', { p_request: data.requestId, p_actor: actorId, p_decision: data.decision })
  ensure(!result.error, 404, 'upgrade_unavailable')
  return { ...z.record(z.string(), z.unknown()).parse(result.data), scope: ALL_SCOPES }
}
