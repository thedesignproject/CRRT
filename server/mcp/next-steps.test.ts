// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ progress: vi.fn(), workProject: vi.fn(), permission: vi.fn() }))
vi.mock('../../api/_lib/store.js', () => ({ getProjectMember: vi.fn(), listBrainRulesFor: vi.fn(), listNextSteps: vi.fn(), getNextStep: vi.fn(), pauseNextStep: vi.fn(), citeNextStepRules: vi.fn() }))
vi.mock('./actions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./actions.js')>()),
  actionTools: [{ name: 'update_feedback_progress', run: fake.progress }], workProject: fake.workProject, permission: fake.permission,
}))
import { citeNextStepRules, getNextStep, getProjectMember, listBrainRulesFor, listNextSteps, pauseNextStep } from '../../api/_lib/store.js'
import { McpError } from './auth.js'
import { tools } from './tools.js'

const actor = { user_id: 'user', email: 'a@test.local', connection_id: 'connection' }
const [stepId, workId, ruleId, one, two] = ['1', '2', '3', '4', '5'].map(n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`)
const step = { id: stepId, title: 'T', tag: '/pricing', status: 'open' as const, createdAt: 'c', comments: [{ id: one, body: 'B', authorName: null }], requesters: [], citations: [], conflict: null }
const rule = { id: ruleId, title: 'T', body: 'B', projectKey: 'p', authorUserId: null, createdAt: 'c', updatedAt: 'd' }
const complete = { stepId, workId, agentId: 'worker', promptVersion: '1', summary: 'Done', idempotencyKey: 'unique-request-key' }
const run = (name: string, input: Record<string, unknown>) => tools.find(tool => tool.name === name)!.run(input, actor)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProjectMember).mockResolvedValue({ role: 'member', feedbackAllowed: true })
  vi.mocked(listNextSteps).mockResolvedValue([step])
  vi.mocked(getNextStep).mockResolvedValue({ projectKey: 'p', status: 'open', incompleteCommentIds: [one, two] })
  vi.mocked(listBrainRulesFor).mockResolvedValue([rule])
  vi.mocked(pauseNextStep).mockResolvedValue(true)
  fake.workProject.mockResolvedValue('p')
  fake.progress.mockResolvedValue({ outcome: 'applied', projectId: 'p' })
})

it('registers the step tools: listing for every connection, writes behind crrt:implement', () => {
  expect(tools.find(tool => tool.name === 'list_next_steps')?.scope).toBeUndefined()
  for (const name of ['complete_next_step', 'report_rule_conflict']) expect(tools.find(tool => tool.name === name)?.scope).toBe('crrt:implement')
})

it('lists the next steps of a project the actor can read', async () => {
  expect(await run('list_next_steps', { projectKey: 'p' })).toEqual({ contractVersion: '1', projectKey: 'p', steps: [step] })
  expect(listNextSteps).toHaveBeenCalledWith('p')
  vi.mocked(getProjectMember).mockResolvedValueOnce(null)
  await expect(run('list_next_steps', { projectKey: 'p' })).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  expect(listNextSteps).toHaveBeenCalledTimes(1)
})

it('completes each unfinished comment through update_feedback_progress and records the cited rules', async () => {
  vi.mocked(listNextSteps).mockResolvedValueOnce([])
  expect(await run('complete_next_step', { ...complete, ruleIds: [ruleId] })).toEqual({ contractVersion: '1', stepId, status: 'done' })
  expect(fake.workProject).toHaveBeenCalledWith(actor, workId)
  const keys = fake.progress.mock.calls.map(([input]) => input.idempotencyKey)
  expect(fake.progress.mock.calls.map(([input]) => input)).toEqual([one, two].map((feedbackId, n) => ({
    workId, agentId: 'worker', promptVersion: '1', feedbackId, action: 'complete', summary: 'Done', idempotencyKey: keys[n] })))
  expect(keys[0]).toMatch(/^[0-9a-f]{64}$/)
  expect(keys[0]).not.toBe(keys[1])
  expect(listBrainRulesFor).toHaveBeenCalledWith('user', 'p')
  expect(citeNextStepRules).toHaveBeenCalledWith(stepId, [ruleId], `mcp:${workId}:worker`)
  // A step still waiting on other comments stays open.
  expect(await run('complete_next_step', complete)).toEqual({ contractVersion: '1', stepId, status: 'open' })
  expect(citeNextStepRules).toHaveBeenLastCalledWith(stepId, [], `mcp:${workId}:worker`)
})

it('refuses unknown, foreign and paused steps and rules that do not apply', async () => {
  vi.mocked(getNextStep).mockResolvedValueOnce(null)
  await expect(run('complete_next_step', complete)).rejects.toMatchObject({ status: 404, code: 'next_step_not_found' })
  vi.mocked(getNextStep).mockResolvedValueOnce({ projectKey: 'other', status: 'open', incompleteCommentIds: [one] })
  await expect(run('complete_next_step', complete)).rejects.toMatchObject({ status: 404, code: 'next_step_not_found' })
  vi.mocked(getNextStep).mockResolvedValueOnce({ projectKey: 'p', status: 'paused', incompleteCommentIds: [one] })
  await expect(run('complete_next_step', complete)).rejects.toMatchObject({ status: 409, code: expect.stringMatching(/^step_paused/) })
  vi.mocked(listBrainRulesFor).mockResolvedValueOnce([])
  await expect(run('complete_next_step', { ...complete, ruleIds: [ruleId] })).rejects.toMatchObject({ status: 400, code: expect.stringMatching(/^rule_not_applicable/) })
  fake.workProject.mockRejectedValueOnce(new McpError(403, 'insufficient_scope'))
  await expect(run('complete_next_step', complete)).rejects.toThrow('insufficient_scope')
  expect(fake.progress).not.toHaveBeenCalled()
  expect(citeNextStepRules).not.toHaveBeenCalled()
})

it('tells the agent to claim first, and passes other failures through', async () => {
  fake.progress.mockRejectedValueOnce(new McpError(409, 'claim_required'))
  await expect(run('complete_next_step', complete)).rejects.toMatchObject({ status: 409, code: expect.stringMatching(/^claim_required: claim each .* prepare_feedback_work/) })
  fake.progress.mockRejectedValueOnce(new McpError(409, 'feedback_not_eligible'))
  await expect(run('complete_next_step', complete)).rejects.toMatchObject({ code: 'feedback_not_eligible' })
  fake.progress.mockRejectedValueOnce(new Error('boom'))
  await expect(run('complete_next_step', complete)).rejects.toThrow('boom')
  expect(citeNextStepRules).not.toHaveBeenCalled()
})

it('pauses a step on a rule conflict', async () => {
  expect(await run('report_rule_conflict', { stepId, ruleId, question: ' Red or blue? ' })).toEqual({ contractVersion: '1', stepId, status: 'paused' })
  expect(fake.permission).toHaveBeenCalledWith(actor, 'p', 'crrt:implement')
  expect(pauseNextStep).toHaveBeenCalledWith(stepId, ruleId, 'Red or blue?')
})

it('refuses conflicts on unknown, forbidden or done steps and with rules that do not apply', async () => {
  const conflict = { stepId, ruleId, question: 'Q?' }
  vi.mocked(getNextStep).mockResolvedValueOnce(null)
  await expect(run('report_rule_conflict', conflict)).rejects.toMatchObject({ status: 404, code: 'next_step_not_found' })
  fake.permission.mockRejectedValueOnce(new McpError(403, 'forbidden'))
  await expect(run('report_rule_conflict', conflict)).rejects.toThrow('forbidden')
  vi.mocked(listBrainRulesFor).mockResolvedValueOnce([])
  await expect(run('report_rule_conflict', conflict)).rejects.toMatchObject({ code: expect.stringMatching(/^rule_not_applicable/) })
  expect(pauseNextStep).not.toHaveBeenCalled()
  vi.mocked(pauseNextStep).mockResolvedValueOnce(false)
  await expect(run('report_rule_conflict', conflict)).rejects.toMatchObject({ status: 409, code: 'step_done' })
  await expect(run('report_rule_conflict', { ...conflict, question: ' ' })).rejects.toThrow()
})
