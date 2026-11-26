import { z } from 'zod'
import { waitUntil } from '@vercel/functions'
import { closeLinkedExternalWork } from '../../api/_lib/external-work-sync.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { generateAccessToken, generateSlug, encryptToken, hashToken } from '../../api/_lib/tokens.js'
import { resolveWidgetAgentAccess } from '../../api/_lib/billing/agent-entitlement.js'
import { canProject } from '../../api/_lib/project-capabilities.js'
import { hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { contextTools } from './context.js'
import { access } from './feedback.js'
import { checked, ensure, hasScope, McpError, uuid, type McpIdentity } from './auth.js'
import type { ToolSpec } from './transport.js'

export const key = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).describe('Unique retry key; reuse only for the identical request. A UUID works.')
const agentId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).describe('Unique stable identity for this agent/subagent in this work session.')
const projectId = z.string().min(1).max(200)
export const summary = z.string().trim().min(1).max(2000)
export const workInput = { workId: uuid, agentId, promptVersion: z.literal('1').describe('Acknowledge the full implementationPrompt returned during preparation.') }
const prepareInput = z.object({ projectId, feedbackIds: z.array(uuid).min(1).max(20).refine(ids => new Set(ids).size === ids.length), idempotencyKey: key, promptVersion: z.literal('1') }).strict()
const progressInput = z.object({ ...workInput, feedbackId: uuid, action: z.enum(['claim', 'start', 'note', 'block', 'complete']), summary, idempotencyKey: key }).strict()
const presenceInput = z.object({ ...workInput, status: z.enum(['reading', 'idle', 'working', 'blocked']), summary }).strict()
const statusInput = z.object({ projectId, feedbackId: uuid, status: z.enum(['ready_for_agent', 'open', 'rejected', 'ready_for_testing', 'done']), expectedUpdatedAt: z.iso.datetime({ offset: true }), userRequested: z.literal(true).describe('Only set when the human explicitly requested this status change.'), reason: z.string().trim().min(1).max(1000) }).strict()
const operationOutput = z.object({ outcome: z.enum(['applied', 'duplicate']), projectId: z.string(), feedbackId: uuid.optional(), implementationStatus: z.string().optional() }).strict()
const failures = new Set(['insufficient_scope', 'forbidden', 'work_unavailable', 'feedback_not_eligible', 'feedback_not_found', 'idempotency_conflict', 'claim_required', 'claimed_conflict', 'reviewer_owned', 'status_conflict', 'github_issue_creation_in_progress', 'repository_changed', 'feedback_changed', 'sender_removed', 'listener_stopped', 'dispatch_completed'])
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getServiceSupabase().rpc(name, args)
  if (error) {
    const code = failures.has(error.message) ? error.message : error.message.startsWith('cloud_plan_limit') ? 'plan_limit' : 'storage_unavailable'
    throw new McpError(code === 'storage_unavailable' ? 503 : ['forbidden', 'insufficient_scope', 'plan_limit'].includes(code) ? 403 : 409, code)
  }
  return data
}
export async function permission(actor: McpIdentity, project: string, scope: 'crrt:implement' | 'crrt:review') {
  ensure(hasScope(actor, scope), 403, 'insufficient_scope')
  const role = await access(actor, project)
  ensure(canProject(role, scope === 'crrt:implement' ? 'agent:operate' : 'feedback:manage'), 403, 'forbidden')
  if (scope === 'crrt:implement') ensure((await resolveWidgetAgentAccess(project, actor.user_id)).state === 'ready', 403, 'agent_access_required')
}
export async function workProject(actor: McpIdentity, workId: string) {
  ensure(hasScope(actor, 'crrt:implement'), 403, 'insufficient_scope')
  const row = await checked(await getServiceSupabase().from('mcp_workflows').select('feedback_shares!inner(project_id)').eq('share_id', workId).eq('connection_id', actor.connection_id).maybeSingle())
  ensure(row, 404, 'work_unavailable')
  const project = z.object({ feedback_shares: z.object({ project_id: z.string() }) }).parse(row).feedback_shares.project_id
  await permission(actor, project, 'crrt:implement')
  return project
}
const operationArgs = (actor: McpIdentity) => ({ p_connection: actor.connection_id, p_actor: actor.user_id })
export const actionTools: ToolSpec[] = [{
  name: 'prepare_feedback_work', title: 'Prepare feedback work', scope: 'crrt:implement',
  description: 'Creates a tracked work session for 1-20 accepted, Ready for Agent feedback items and returns its workId with the full implementationPrompt. Does not modify any repository or expose share credentials. Retrying with the same idempotencyKey and selection returns the same session.',
  input: prepareInput,
  output: z.object({ workId: uuid, projectId: z.string(), feedbackIds: z.array(uuid), promptVersion: z.literal('1'), implementationPrompt: z.string() }).strict(),
  async run(raw, actor) {
    const input = prepareInput.parse(raw)
    await permission(actor, input.projectId, 'crrt:implement')
    const context = await contextTools[1].run({ projectId: input.projectId, feedbackIds: input.feedbackIds }, actor)
    const credential = generateAccessToken()
    const workId = uuid.parse(await rpc('mcp_prepare_work', { ...operationArgs(actor), p_project: input.projectId, p_ids: input.feedbackIds, p_key: input.idempotencyKey,
      p_request_hash: hashProof(JSON.stringify([input.projectId, [...input.feedbackIds].sort()])),
      p_share: { scope_type: 'selection', slug: generateSlug(), access_token_hash: hashToken(credential), access_token_ciphertext: encryptToken(credential), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() },
    }))
    return { workId, projectId: input.projectId, feedbackIds: input.feedbackIds, promptVersion: '1', implementationPrompt: z.string().parse(context.implementationPrompt) }
  },
}, {
  name: 'report_agent_presence', title: 'Report agent presence', scope: 'crrt:implement',
  description: 'Reports an agent status (reading, idle, working, or blocked) with a short summary for a prepared work session. Reviewers see it in CRRT. Each agent or subagent uses its own stable agentId.',
  input: presenceInput, output: operationOutput,
  async run(raw, actor) {
    const input = presenceInput.parse(raw)
    await workProject(actor, input.workId)
    return operationOutput.parse(await rpc('mcp_work_operation', { ...operationArgs(actor), p_work: input.workId, p_agent: input.agentId, p_comment: null, p_op: input.status, p_key: null, p_summary: input.summary, p_request_hash: null }))
  },
}, {
  name: 'update_feedback_progress', title: 'Update feedback progress', scope: 'crrt:implement',
  description: 'Claims an accepted feedback item, or reports start, note, block, or complete for it, within a prepared work session. Complete sets ready_for_testing, not done. Fails on claim conflicts, and cannot reopen reviewer-completed work or change review status.',
  input: progressInput, output: operationOutput,
  async run(raw, actor) {
    const input = progressInput.parse(raw)
    await workProject(actor, input.workId)
    return operationOutput.parse(await rpc('mcp_work_operation', { ...operationArgs(actor), p_work: input.workId, p_agent: input.agentId, p_comment: input.feedbackId, p_op: input.action, p_key: input.idempotencyKey, p_summary: input.summary,
      p_request_hash: hashProof(JSON.stringify([input.feedbackId, input.action, input.summary])),
    }))
  },
}, {
  name: 'set_feedback_status', title: 'Set feedback review status', scope: 'crrt:review',
  description: 'Records a human review decision on a feedback item: ready_for_agent, open, rejected, ready_for_testing, or done. Requires the current updatedAt as expectedUpdatedAt (stale updates fail), userRequested:true, a reason, review scope, and feedback-management permission. ready_for_agent accepts the item and resets implementation to unassigned; open and rejected remove it from Ready for Agent.',
  input: statusInput,
  output: z.object({ projectId: z.string(), feedbackId: uuid, reviewStatus: z.enum(['open', 'accepted', 'rejected']), implementationStatus: z.string(), updatedAt: z.string() }).strict(),
  async run(raw, actor) {
    const input = statusInput.parse(raw)
    await permission(actor, input.projectId, 'crrt:review')
    const review = { ready_for_agent: 'approved', open: 'pending', rejected: 'rejected', ready_for_testing: 'approved', done: 'approved' }[input.status]
    const implementation = { ready_for_agent: 'unassigned', open: 'unassigned', rejected: 'unassigned', ready_for_testing: 'ready_for_testing', done: 'done' }[input.status]
    const result = await rpc('mcp_set_feedback_status', { ...operationArgs(actor), p_project: input.projectId, p_comment: input.feedbackId, p_expected: input.expectedUpdatedAt, p_review: review, p_implementation: implementation, p_reason: input.reason }) as Record<string, unknown>
    if (input.status === 'rejected') waitUntil(closeLinkedExternalWork(input.projectId, input.feedbackId, String(result.updatedAt)).catch(() => undefined))
    return result
  },
}]
