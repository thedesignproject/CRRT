import { randomUUID, createHash } from 'node:crypto'
import { getServiceSupabase } from './supabase.js'
import { encryptToken, decryptToken } from './tokens.js'

type Flow = { connectionId: string; requestKey: string }
const hash = (flow: Flow, actor: string, project: string) => createHash('sha256').update(JSON.stringify(['github-flow', flow.connectionId, actor, project])).digest('hex')
function requireValue(value: unknown): asserts value { if (!value) throw new Error('github_flow_unavailable') }
async function live(flow: Flow, actor: string) {
  const result = await getServiceSupabase().rpc('mcp_require_connection', { p_connection: flow.connectionId, p_actor: actor, p_scope: 'crrt:dashboard' })
  requireValue(!result.error)
}
export async function startMcpGithubFlow(connectionId: string, actor: string, project: string) {
  const flow = { connectionId, requestKey: `github-flow_${randomUUID()}` }
  await live(flow, actor)
  const result = await getServiceSupabase().from('mcp_dashboard_operations').insert({ connection_id: connectionId, request_key: flow.requestKey, request_hash: hash(flow, actor, project) }).select('created_at').single()
  requireValue(!result.error && result.data)
  return { flowId: flow.requestKey, expiresAt: new Date(Date.parse(result.data.created_at) + 600_000).toISOString() }
}
async function row(flow: Flow, actor: string, project: string) {
  requireValue(/^github-flow_[0-9a-f-]{36}$/.test(flow.requestKey))
  await live(flow, actor)
  const result = await getServiceSupabase().from('mcp_dashboard_operations').select('request_hash,response,created_at').eq('connection_id', flow.connectionId).eq('request_key', flow.requestKey).maybeSingle()
  requireValue(!result.error && result.data && result.data.request_hash === hash(flow, actor, project))
  requireValue(Date.parse(result.data.created_at) + 600_000 > Date.now())
  return result.data
}
export async function completeMcpGithubFlow(flow: Flow, actor: string, project: string, data: { installationToken: string; repositories: unknown[] }) {
  await row(flow, actor, project)
  const result = await getServiceSupabase().from('mcp_dashboard_operations').update({ response: { ciphertext: encryptToken(JSON.stringify(data)) } })
    .eq('connection_id', flow.connectionId).eq('request_key', flow.requestKey).is('response', null)
  requireValue(!result.error)
}
export async function readMcpGithubFlow(flow: Flow, actor: string, project: string) {
  const current = await row(flow, actor, project)
  const expiresAt = new Date(Date.parse(current.created_at) + 600_000).toISOString()
  if (current.response === null) return { state: 'pending', flowId: flow.requestKey, expiresAt }
  const data = JSON.parse(decryptToken((current.response as { ciphertext: string }).ciphertext)) as { installationToken: string; repositories: unknown[] }
  return { state: 'verified', flowId: flow.requestKey, expiresAt, ...data }
}
