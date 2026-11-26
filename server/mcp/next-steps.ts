import { z } from 'zod'
import { citeNextStepRules, getNextStep, listBrainRulesFor, listNextSteps, pauseNextStep } from '../../api/_lib/store.js'
import { hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { actionTools, key, permission, summary, workInput, workProject } from './actions.js'
import { access } from './feedback.js'
import { ensure, McpError, uuid, type McpIdentity } from './auth.js'
import type { ToolSpec } from './transport.js'

const stepSchema = z.object({
  id: uuid, title: z.string(), tag: z.string(), status: z.enum(['open', 'paused']), createdAt: z.string(),
  comments: z.array(z.object({ id: uuid, body: z.string(), authorName: z.string().nullable() }).strict()),
  requesters: z.array(z.string()),
  citations: z.array(z.object({ ruleId: uuid, title: z.string() }).strict()),
  conflict: z.object({ ruleId: uuid.nullable(), ruleTitle: z.string().nullable(), question: z.string(), decision: z.enum(['keep_rule', 'update_rule']).nullable() }).strict().nullable(),
}).strict()
const listInput = z.object({ projectKey: z.string().min(1).max(200).describe('Project id from list_projects.') }).strict()
const completeInput = z.object({ ...workInput, stepId: uuid, summary, idempotencyKey: key,
  ruleIds: z.array(uuid).max(20).default([]).describe('Ids of the list_rules rules you followed for this step.') }).strict()
const conflictInput = z.object({ stepId: uuid, ruleId: uuid, question: z.string().trim().min(1).max(2000).describe('The choice the user must make, in a sentence or two.') }).strict()

async function ensureRulesApply(actor: McpIdentity, project: string, ruleIds: string[]) {
  const applying = new Set((await listBrainRulesFor(actor.user_id, project)).map(rule => rule.id))
  ensure(ruleIds.every(id => applying.has(id)), 400, 'rule_not_applicable: use rule ids from list_rules for this step\'s project')
}
const progress = actionTools.find(tool => tool.name === 'update_feedback_progress')!

export const nextStepTools: ToolSpec[] = [{
  name: 'list_next_steps', title: 'List next steps',
  description: 'Lists the open and paused next steps of one project you can access, oldest first. A step groups the Ready for Agent feedback left on the same page and element; work on steps rather than single feedback items. A paused step waits for the user to answer its rule conflict; once answered it is open again and conflict.decision holds the answer (keep_rule or update_rule).',
  input: listInput,
  output: z.object({ contractVersion: z.literal('1'), projectKey: z.string(), steps: z.array(stepSchema) }).strict(),
  async run(raw, actor) {
    const { projectKey } = listInput.parse(raw)
    await access(actor, projectKey)
    return { contractVersion: '1', projectKey, steps: await listNextSteps(projectKey) }
  },
}, {
  name: 'complete_next_step', title: 'Complete next step', scope: 'crrt:implement',
  description: 'Completes every feedback item of a next step, exactly like update_feedback_progress complete (ready_for_testing, not done), and records the Brain rules you followed. First prepare a work session with prepare_feedback_work for the step\'s feedback ids and claim each with update_feedback_progress. Cannot complete a paused step.',
  input: completeInput,
  output: z.object({ contractVersion: z.literal('1'), stepId: uuid, status: z.enum(['open', 'paused', 'done']) }).strict(),
  async run(raw, actor) {
    const input = completeInput.parse(raw)
    const project = await workProject(actor, input.workId)
    const step = await getNextStep(input.stepId)
    ensure(step?.projectKey === project, 404, 'next_step_not_found')
    ensure(step.status !== 'paused', 409, 'step_paused: wait for the user to answer the rule conflict')
    await ensureRulesApply(actor, project, input.ruleIds)
    for (const feedbackId of step.incompleteCommentIds) {
      // One retry key per feedback item, derived from the step's key, so retries stay duplicates.
      await progress.run({ workId: input.workId, agentId: input.agentId, promptVersion: input.promptVersion, feedbackId, action: 'complete',
        summary: input.summary, idempotencyKey: hashProof(JSON.stringify([input.idempotencyKey, feedbackId])) }, actor).catch((error: unknown) => {
        if (error instanceof McpError && error.code === 'claim_required') throw new McpError(409, 'claim_required: claim each of the step\'s feedback ids with update_feedback_progress in a prepare_feedback_work session first')
        throw error
      })
    }
    await citeNextStepRules(input.stepId, input.ruleIds, `mcp:${input.workId}:${input.agentId}`)
    const open = (await listNextSteps(project)).find(item => item.id === input.stepId)
    return { contractVersion: '1', stepId: input.stepId, status: open?.status ?? 'done' }
  },
}, {
  name: 'report_rule_conflict', title: 'Report rule conflict', scope: 'crrt:implement',
  description: 'Pauses a next step when its feedback conflicts with a Brain rule, instead of guessing. The user then chooses Keep rule or Update rule in CRRT; list_next_steps shows the answer.',
  input: conflictInput,
  output: z.object({ contractVersion: z.literal('1'), stepId: uuid, status: z.literal('paused') }).strict(),
  async run(raw, actor) {
    const input = conflictInput.parse(raw)
    const step = await getNextStep(input.stepId)
    ensure(step, 404, 'next_step_not_found')
    await permission(actor, step.projectKey, 'crrt:implement')
    await ensureRulesApply(actor, step.projectKey, [input.ruleId])
    ensure(await pauseNextStep(input.stepId, input.ruleId, input.question), 409, 'step_done')
    return { contractVersion: '1', stepId: input.stepId, status: 'paused' }
  },
}]
