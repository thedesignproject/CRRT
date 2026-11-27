import { z } from 'zod'
import { getServiceSupabase } from './supabase.js'

/** Direct send: the dashboard queues one comment for a terminal listening through the CRRT MCP. */
export const sendInput = z.object({
  listenerId: z.uuid(), commentId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), idempotencyKey: z.uuid(),
}).strict()

export class DispatchError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
const conflicts = new Set(['repository_changed', 'repository_mismatch', 'invalid_senders', 'listener_conflict', 'listener_limit', 'listener_offline', 'listener_stopped', 'listener_not_found', 'feedback_changed', 'feedback_not_eligible', 'already_sent', 'idempotency_conflict', 'sender_removed', 'dispatch_completed'])

/** Calls a direct send function; its exceptions become status codes without database details. */
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

/** The listeners the actor may send to, or with a connection, the listeners that connection started. */
export async function listListeners(project: string, actor: string, connection?: string) {
  let query = getServiceSupabase().from('agent_listeners').select('id,label,repo_url,stopped,heartbeat_at').eq('project_key', project)
  query = connection ? query.eq('connection_id', connection).eq('user_id', actor) : query.contains('sender_ids', [actor])
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) throw new DispatchError(503, 'dispatch_unavailable')
  return (data ?? []).map(row => ({
    listenerId: row.id as string, label: row.label as string, repoUrl: row.repo_url as string,
    // A terminal polls every few seconds while it listens; a minute of silence means it stopped.
    online: !row.stopped && Date.parse(row.heartbeat_at) >= Date.now() - 60_000, stopped: row.stopped as boolean,
  }))
}

/** Listeners the actor may send to and the project's recent dispatches, newest first. */
export async function deliveryState(project: string, actor: string) {
  const listeners = await listListeners(project, actor)
  // shortcut: only the newest 200 dispatches; page by comment if a project keeps more in flight.
  const { data, error } = await getServiceSupabase().from('agent_dispatches')
    .select('id,comment_id,listener_id,state,reason,comments(implementation_status)')
    .eq('project_key', project).order('created_at', { ascending: false }).limit(200)
  if (error) throw new DispatchError(503, 'dispatch_unavailable')
  const dispatches = (data ?? []).map(row => {
    const progress = (row.comments as unknown as { implementation_status: string | null } | null)?.implementation_status
    // A received comment shows the agent's progress on it.
    const state = row.state === 'received' && progress === 'in_progress' ? 'working'
      : row.state === 'received' && progress === 'blocked' ? 'blocked' : row.state as string
    return { dispatchId: row.id as string, commentId: row.comment_id as string, listenerId: row.listener_id as string, state, reason: row.reason as string | null }
  })
  return { listeners, dispatches }
}
