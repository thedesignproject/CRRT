import { z } from 'zod'
import { getServiceSupabase } from './supabase.js'
import { resolveWidgetAgentAccess } from './billing/agent-entitlement.js'

export const sendInput = z.object({
  projectKey: z.string().min(1).max(200), pageUrl: z.url().max(4096), listenerId: z.uuid(),
  commentId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), idempotencyKey: z.uuid(),
}).strict()
export class DispatchError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
const conflicts = new Set(['repository_changed', 'repository_mismatch', 'invalid_senders', 'listener_conflict', 'listener_limit', 'listener_offline', 'listener_stopped', 'listener_not_found', 'feedback_changed', 'feedback_not_eligible', 'already_sent', 'idempotency_conflict', 'sender_removed', 'dispatch_completed'])
export async function dispatchRpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await getServiceSupabase().rpc(name, args)
  if (error) {
    const code = error.message
    if (code === 'forbidden' || code === 'insufficient_scope') throw new DispatchError(403, code)
    if (code.startsWith('cloud_plan_limit')) throw new DispatchError(403, 'agent_access_required')
    if (conflicts.has(code)) throw new DispatchError(409, code)
    throw new DispatchError(503, 'dispatch_unavailable')
  }
  return data ?? {}
}
export async function requireDispatchAccess(project: string, actor: string) {
  const access = await resolveWidgetAgentAccess(project, actor)
  if (access.state !== 'ready') throw new DispatchError(403, access.state)
  await dispatchRpc('agent_dispatch_actor', { p_actor: actor, p_project: project, p_capability: 'agent:operate' })
}
export async function listListeners(project: string, actor: string, connection?: string) {
  await requireDispatchAccess(project, actor)
  let query = getServiceSupabase().from('agent_listeners').select('*').eq('project_key', project)
  query = connection ? query.eq('connection_id', connection).eq('user_id', actor) : query.contains('sender_ids', [actor])
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) throw new DispatchError(503, 'dispatch_unavailable')
  return Promise.all((data ?? []).map(async row => {
    const check = await getServiceSupabase().rpc('agent_listener_access', { l: row })
    return { listenerId: row.id as string, label: row.label as string, repoUrl: row.repo_url as string,
      online: !check.error && !row.stopped && Date.parse(row.heartbeat_at) >= Date.now() - 60_000,
      stopped: row.stopped as boolean }
  }))
}
export async function widgetDispatchState(project: string, page: string, actor: string) {
  const listeners = await listListeners(project, actor)
  const { data, error } = await getServiceSupabase().from('agent_dispatches')
    .select('id,comment_id,listener_id,state,reason,created_at,comments!inner(url,implementation_status)')
    .eq('project_key', project).eq('comments.url', page).order('created_at', { ascending: false }).limit(50)
  if (error) throw new DispatchError(503, 'dispatch_unavailable')
  const dispatches = (data ?? []).map(row => {
    const comment = row.comments as unknown as { implementation_status: string }
    const state = row.state === 'received' && ['in_progress', 'blocked'].includes(comment.implementation_status)
      ? comment.implementation_status === 'in_progress' ? 'working' : 'blocked' : row.state
    return { dispatchId: row.id as string, commentId: row.comment_id as string, listenerId: row.listener_id as string,
      state: state as string, reason: row.reason as string | null }
  })
  return { listeners, dispatches }
}
export async function sendDispatch(actor: string, input: z.infer<typeof sendInput>) {
  await requireDispatchAccess(input.projectKey, actor)
  return dispatchRpc('agent_dispatch_send', { p_actor: actor, p_project: input.projectKey, p_page: input.pageUrl,
    p_listener: input.listenerId, p_comment: input.commentId, p_expected: input.expectedUpdatedAt, p_key: input.idempotencyKey })
}
