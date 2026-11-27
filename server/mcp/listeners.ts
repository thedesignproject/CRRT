import { z } from 'zod'
import { DispatchError, dispatchRpc, listListeners } from '../../api/_lib/agent-dispatch.js'
import { generateAccessToken, generateSlug, hashToken, encryptToken } from '../../api/_lib/tokens.js'
import { ensure, hasScope, McpError, uuid, type McpIdentity } from './auth.js'
import { contextTools } from './context.js'
import { permission } from './actions.js'
import type { ToolSpec } from './transport.js'

const projectId = z.string().min(1).max(200)
const output = z.record(z.string(), z.unknown())
const register = z.object({ projectId, listenerId: uuid, label: z.string().trim().min(1).max(80),
  repositoryUrl: z.url().max(500), senderIds: z.array(uuid).min(1).max(50).optional(), userRequested: z.literal(true),
}).strict()
const waiting = z.object({ listenerId: uuid, waitSeconds: z.number().int().min(0).max(25).default(20) }).strict()
const stop = z.object({ listenerId: uuid, userRequested: z.literal(true) }).strict()
export const listenerInstructions = 'Keep this listening session active until the user asks to stop. Call wait_for_feedback again after waiting/cancelled responses and after completing each received item; do not end the turn between jobs. For received work, read all handoff context and follow the complete implementationPrompt. Verify the current checkout matches repoUrl before edits, use a stable agentId unique to this executor, claim before editing, and report start/block/complete through the existing work tools. While working, report presence at least every 30 seconds so the terminal stays listed as listening. Reuse the returned workId on retries; never execute a received job twice. Re-read feedback before each new item. Only implement the sent feedback. A send authorizes implementation and verification, not merge or deploy. On ambiguity report blocked and ask the human; do not restart blocked work automatically. If the client cannot keep waiting, stop the listener and report that limitation. MCP cannot wake a closed terminal.'

async function authorized(actor: McpIdentity, action: () => Promise<Record<string, unknown>>) {
  ensure(hasScope(actor, 'crrt:implement'), 403, 'insufficient_scope')
  try { return await action() } catch (error) {
    if (error instanceof DispatchError) throw new McpError(error.status, error.code)
    throw error
  }
}
const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
export const listenerTools: ToolSpec[] = [{
  name: 'start_feedback_listener', title: 'Start feedback listener', scope: 'crrt:implement', annotations, input: register, output,
  description: 'Start or resume direct send delivery only when the human asks this terminal to listen. First verify the local repository against the configured project repository; repositoryUrl must match exactly. Use a stable UUID listenerId for this terminal. Default sender is the connected user; only project admins may authorize other current members via senderIds. This starts a bounded wait-tool loop, not a background daemon. Read and follow the returned listening instructions.',
  run: (raw, actor) => authorized(actor, async () => {
    const input = register.parse(raw)
    const listener = await dispatchRpc('agent_listener_register', { p_actor: actor.user_id, p_connection: actor.connection_id,
      p_id: input.listenerId, p_project: input.projectId, p_label: input.label, p_repo: input.repositoryUrl, p_senders: input.senderIds ?? [actor.user_id] })
    return { ...listener, instructions: listenerInstructions }
  }),
}, {
  name: 'list_feedback_listeners', title: 'List feedback listeners', scope: 'crrt:implement', annotations: { ...annotations, readOnlyHint: true },
  input: z.object({ projectId }).strict(), output,
  description: 'Find this connection’s listeners for a project to recover the existing listenerId after a context reload. This does not start listening or authorize new work.',
  run: (raw, actor) => authorized(actor, async () => {
    const project = projectId.parse(raw.projectId)
    await permission(actor, project, 'crrt:implement')
    return { listeners: await listListeners(project, actor.user_id, actor.connection_id) }
  }),
}, {
  name: 'wait_for_feedback', title: 'Wait for sent feedback', scope: 'crrt:implement', annotations, input: waiting, output, maxResultBytes: 262144,
  description: 'Wait for feedback a project member sends to a listener started by this connection. Call repeatedly while the user wants to listen; each call is bounded to 25 seconds. Receipt atomically creates/reuses a tracked work session. Lost responses replay the same work until completion. Process one item at a time, claim before editing, follow the full implementation prompt, then wait again. A blocked item needs a human decision. Do not invent receipt when the tool fails.',
  run: (raw, actor) => authorized(actor, async () => {
    const input = waiting.parse(raw), deadline = Date.now() + input.waitSeconds * 1000
    const token = generateAccessToken()
    const share = { scope_type: 'selection', slug: generateSlug(), access_token_hash: hashToken(token), access_token_ciphertext: encryptToken(token), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }
    while (true) {
      const result = await dispatchRpc('agent_listener_poll', { p_actor: actor.user_id, p_connection: actor.connection_id, p_id: input.listenerId, p_share: share })
      if (result.state === 'received') {
        const context = await contextTools[1].run({ projectId: result.projectId, feedbackIds: [result.feedbackId] }, actor)
        return { ...result, promptVersion: '1', context, instructions: listenerInstructions }
      }
      if (result.state !== 'waiting' || Date.now() >= deadline) return { ...result, instructions: listenerInstructions }
      await new Promise(resolve => setTimeout(resolve, Math.min(2000, deadline - Date.now())))
    }
  }),
}, {
  name: 'stop_feedback_listener', title: 'Stop feedback listener', scope: 'crrt:implement', annotations, input: stop, output,
  description: 'Pause future delivery to this terminal when the user asks to stop listening. Queued work is preserved for an explicitly resumed listener. This does not interrupt a running shell command or model invocation.',
  run: (raw, actor) => authorized(actor, async () => {
    const input = stop.parse(raw)
    await dispatchRpc('agent_listener_stop', { p_actor: actor.user_id, p_connection: actor.connection_id, p_id: input.listenerId })
    return { listenerId: input.listenerId, stopped: true }
  }),
}]
