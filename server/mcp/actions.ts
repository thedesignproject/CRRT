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

const key = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).describe('Unique retry key; reuse only for the identical request. A UUID works.')
const agentId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).describe('Unique stable identity for this agent/subagent in this work session.')
const projectId = z.string().min(1).max(200)
const summary = z.string().trim().min(1).max(2000)
const workInput = { workId: uuid, agentId, promptVersion: z.literal('1').describe('Acknowledge the full implementationPrompt returned during preparation.') }
const prepareInput = z.object({ projectId, feedbackIds: z.array(uuid).min(1).max(20).refine(ids => new Set(ids).size === ids.length), idempotencyKey: key, promptVersion: z.literal('1') }).strict()
const progressInput = z.object({ ...workInput, feedbackId: uuid, action: z.enum(['claim', 'start', 'note', 'block', 'complete']), summary, idempotencyKey: key }).strict()
const presenceInput = z.object({ ...workInput, status: z.enum(['reading', 'idle', 'working', 'blocked']), summary }).strict()
const statusInput = z.object({ projectId, feedbackId: uuid, status: z.enum(['ready_for_agent', 'open', 'rejected', 'ready_for_testing', 'done']), expectedUpdatedAt: z.iso.datetime({ offset: true }), userRequested: z.literal(true).describe('Only set when the human explicitly requested this status change.'), reason: z.string().trim().min(1).max(1000) }).strict()
const operationOutput = z.object({ outcome: z.enum(['applied', 'duplicate']), projectId: z.string(), feedbackId: uuid.optional(), implementationStatus: z.string().optional() }).strict()
const failures = new Set(['insufficient_scope', 'forbidden', 'work_unavailable', 'feedback_not_eligible', 'feedback_not_found', 'idempotency_conflict', 'claim_required', 'claimed_conflict', 'reviewer_owned', 'status_conflict', 'github_issue_creation_in_progress'])
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getServiceSupabase().rpc(name, args)
  if (error) {
    const code = failures.has(error.message) ? error.message : error.message.startsWith('cloud_plan_limit') ? 'plan_limit' : 'storage_unavailable'
    throw new McpError(code === 'storage_unavailable' ? 503 : ['forbidden', 'insufficient_scope', 'plan_limit'].includes(code) ? 403 : 409, code)
  }
  return data
}
async function permission(actor: McpIdentity, project: string, scope: 'crrt:implement' | 'crrt:review') {
  ensure(hasScope(actor, scope), 403, 'insufficient_scope')
  const role = await access(actor, project)
  ensure(canProject(role, scope === 'crrt:implement' ? 'agent:operate' : 'feedback:manage'), 403, 'forbidden')
  if (scope === 'crrt:implement') ensure((await resolveWidgetAgentAccess(project, actor.user_id)).state === 'ready', 403, 'agent_access_required')
}
async function workProject(actor: McpIdentity, workId: string) {
  ensure(hasScope(actor, 'crrt:implement'), 403, 'insufficient_scope')
  const row = await checked(await getServiceSupabase().from('mcp_workflows').select('feedback_shares!inner(project_id)').eq('share_id', workId).eq('connection_id', actor.connection_id).maybeSingle())
  ensure(row, 404, 'work_unavailable')
  const project = z.object({ feedback_shares: z.object({ project_id: z.string() }) }).parse(row).feedback_shares.project_id
  await permission(actor, project, 'crrt:implement')
  return project
}
const operationArgs = (actor: McpIdentity) => ({ p_connection: actor.connection_id, p_actor: actor.user_id })
export const actionTools: ToolSpec[] = [{
  name: 'prepare_feedback_work', scope: 'crrt:implement',
  description: 'Required before editing or delegating accepted CRRT feedback. First retrieve get_handoff_context and read its full implementationPrompt. Prepares an authorized selection of 1–20 Ready for Agent items and returns the same full prompt and a tracked workId. Pass the complete prompt, workId, project and assigned IDs to every subagent. Do not start if preparation fails. Never exposes share credentials. Reuse idempotencyKey only for an identical selection.',
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
  name: 'report_agent_presence', scope: 'crrt:implement',
  description: 'Use after preparation to announce reading/idle and whenever this agent/subagent starts, blocks or finishes work. Requires the prepared workId and full prompt acknowledgement. Keep the reviewer informed with a concise summary. Each subagent uses a unique stable agentId.',
  input: presenceInput, output: operationOutput,
  async run(raw, actor) {
    const input = presenceInput.parse(raw)
    await workProject(actor, input.workId)
    return operationOutput.parse(await rpc('mcp_work_operation', { ...operationArgs(actor), p_work: input.workId, p_agent: input.agentId, p_comment: null, p_op: input.status, p_key: null, p_summary: input.summary, p_request_hash: null }))
  },
}, {
  name: 'update_feedback_progress', scope: 'crrt:implement',
  description: 'Use to claim before editing and report start/note/block/complete through the existing CRRT workflow. Read get_feedback first and follow the complete implementationPrompt. Requires a prepared workId, promptVersion, stable agentId and unique retry key. Claim conflicts stop work. Only accepted feedback is eligible. Complete marks ready_for_testing, never Done; cannot reopen reviewer-owned completed work or change review status.',
  input: progressInput, output: operationOutput,
  async run(raw, actor) {
    const input = progressInput.parse(raw)
    await workProject(actor, input.workId)
    return operationOutput.parse(await rpc('mcp_work_operation', { ...operationArgs(actor), p_work: input.workId, p_agent: input.agentId, p_comment: input.feedbackId, p_op: input.action, p_key: input.idempotencyKey, p_summary: input.summary,
      p_request_hash: hashProof(JSON.stringify([input.feedbackId, input.action, input.summary])),
    }))
  },
}, {
  name: 'set_feedback_status', scope: 'crrt:review',
  description: 'Use ONLY when the human explicitly asks to change feedback status, never as an automatic implementation step. Read get_feedback immediately first and send its exact updatedAt as expectedUpdatedAt; stale changes fail. ready_for_agent accepts and resets implementation to unassigned; open/rejected remove it from Ready for Agent; ready_for_testing/done are explicit reviewer decisions. Requires userRequested:true, a reason, review scope and current feedback-management permission.',
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
