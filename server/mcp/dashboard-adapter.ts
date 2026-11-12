import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withTrustedUser } from '../../api/_lib/trusted-user.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { encryptToken, decryptToken } from '../../api/_lib/tokens.js'
import { checked, config, ensure, type McpIdentity } from './auth.js'
import { dashboardOperations, type DashboardOperation } from './dashboard-operations.js'
import { recoverDashboardReceipt } from './dashboard-recovery.js'

export type DashboardResult = {
  ok: boolean; status: number; data: unknown
  code?: string; retryable?: boolean; action?: string
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function invoke(operation: DashboardOperation, query: Record<string, string>, body: Record<string, unknown>, actor: McpIdentity, idempotencyKey?: string): Promise<DashboardResult> {
  const origin = new URL(config().origin)
  const req = {
    method: operation.method, query: { ...query }, body: structuredClone(body),
    // A non-credential marker satisfies existing bearer-shape guards. Identity
    // comes exclusively from the request-object registry, never this header.
    headers: { authorization: 'Bearer internal-mcp', host: origin.host, 'x-forwarded-proto': origin.protocol.slice(0, -1), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
  } as unknown as VercelRequest
  let status = 200, data: unknown = null, finished = false
  const res = {
    setHeader: () => res,
    status: (value: number) => { status = value; return res },
    json: (value: unknown) => { data = value; finished = true; return res },
    send: (value: unknown) => { data = value; finished = true; return res },
    end: () => { finished = true; return res },
  } as unknown as VercelResponse
  const handler = await operation.load()
  await withTrustedUser(req, { userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id }, async () => { await handler.default(req, res) })
  ensure(finished, 503, 'dashboard_response_unavailable')
  const ok = status >= 200 && status < 300
  return ok ? { ok, status, data } : {
    ok, status, data, code: status === 401 ? 'login_required' : status === 403 ? 'permission_denied' : status === 402 ? 'plan_required' : status === 409 ? 'state_conflict' : status === 429 ? 'rate_limited' : status >= 500 ? 'service_unavailable' : 'invalid_request',
    retryable: operation.method === 'GET' && (status === 429 || status >= 500),
    action: 'Inspect the dashboard error in data. Recheck current state before another write; do not request broader consent for role, ownership or plan failures.',
  }
}

export async function runDashboardOperation(operation: DashboardOperation, query: Record<string, string>, body: Record<string, unknown>, actor: McpIdentity, key?: string): Promise<DashboardResult> {
  ensure(Object.keys(query).every(name => operation.query.includes(name)), 400, 'unsupported_query')
  ensure(operation.required.every(name => Boolean(query[name])), 400, 'missing_query')
  ensure(operation.name !== 'audits.create' || typeof body.projectKey === 'string' && body.projectKey.length > 0, 400, 'project_required')
  if (operation.method === 'GET') return invoke(operation, query, body, actor)
  ensure(key, 400, 'idempotency_key_required')
  const db = getServiceSupabase()
  const hash = createHash('sha256').update(canonical([operation.name, query, body])).digest('hex')
  const inserted = await db.from('mcp_dashboard_operations').insert({ connection_id: actor.connection_id, request_key: key, request_hash: hash })
  if (inserted.error) {
    ensure(inserted.error.code === '23505', 503, 'storage_unavailable')
    const prior = await checked(await db.from('mcp_dashboard_operations').select('request_hash,response').eq('connection_id', actor.connection_id).eq('request_key', key).maybeSingle())
    ensure(prior && prior.request_hash === hash, 409, 'idempotency_conflict')
    if (prior.response !== null) {
      const receipt = JSON.parse(decryptToken((prior.response as { ciphertext: string }).ciphertext)) as DashboardResult
      return recoverDashboardReceipt(operation, query, body, actor, receipt, async (name, readQuery) => {
        const read = dashboardOperations.find(entry => entry.name === name)!
        return invoke(read, readQuery, {}, actor)
      })
    }
    return { ok: false, status: 409, data: null, code: 'operation_pending_or_uncertain', retryable: false,
      action: 'The original operation is running or its outcome is unknown. Read the affected resource and reconcile it; do not retry with a new key.' }
  }
  // If execution or receipt persistence fails, retain the reservation. Retrying
  // cannot duplicate a side effect after a process crash or lost response.
  const result = await invoke(operation, query, body, actor, key)
  await checked(await db.from('mcp_dashboard_operations').update({ response: { ciphertext: encryptToken(JSON.stringify(result)) } }).eq('connection_id', actor.connection_id).eq('request_key', key))
  return result
}
