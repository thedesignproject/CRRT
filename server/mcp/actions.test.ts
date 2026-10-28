// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ rpc: vi.fn(), query: vi.fn(), permission: vi.fn(), entitlement: vi.fn(), context: vi.fn(), close: vi.fn(), wait: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ getServiceSupabase: () => ({ rpc: fake.rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: fake.query }) }) }) }) }) }))
vi.mock('../../api/_lib/external-work-sync.js', () => ({ closeLinkedExternalWork: fake.close }))
vi.mock('@vercel/functions', () => ({ waitUntil: fake.wait }))
vi.mock('../../api/_lib/billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: fake.entitlement }))
vi.mock('./feedback.js', () => ({ access: fake.permission }))
vi.mock('./context.js', () => ({ contextTools: [{}, { run: fake.context }] }))
import { actionTools } from './actions.js'
import { ALL_SCOPES } from './auth.js'
const work = '11111111-1111-4111-8111-111111111111', feedback = '22222222-2222-4222-8222-222222222222'
const actor = { user_id: 'user', email: 'local@test', connection_id: 'connection', scope: ALL_SCOPES }
const session = { workId: work, agentId: 'worker', promptVersion: '1' }
const progress = { ...session, feedbackId: feedback, action: 'claim', summary: 'Claiming', idempotencyKey: 'unique-request-key' }
const status = { projectId: 'project', feedbackId: feedback, status: 'ready_for_agent', expectedUpdatedAt: '2026-10-27T00:00:00Z', userRequested: true, reason: 'Explicit request' }
const call = (name: string, args: Record<string, unknown>, who = actor) => actionTools.find(tool => tool.name === name)!.run(args, who)
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('SHARE_TOKEN_SECRET', 'local-test-only')
  fake.permission.mockResolvedValue('owner'); fake.entitlement.mockResolvedValue({ state: 'ready' })
  fake.query.mockResolvedValue({ data: { feedback_shares: { project_id: 'project' } }, error: null })
  fake.context.mockResolvedValue({ implementationPrompt: 'Full canonical prompt with all rules' })
  fake.rpc.mockResolvedValue({ data: { outcome: 'applied', projectId: 'project', feedbackId: feedback, implementationStatus: 'claimed' }, error: null })
  fake.close.mockResolvedValue(undefined)
})
it('prepares an explicit selection with a full prompt and no share credentials', async () => {
  fake.rpc.mockResolvedValueOnce({ data: work, error: null })
  const result = await call('prepare_feedback_work', { projectId: 'project', feedbackIds: [feedback], promptVersion: '1', idempotencyKey: 'unique-request-key' })
  expect(result).toEqual({ workId: work, projectId: 'project', feedbackIds: [feedback], promptVersion: '1', implementationPrompt: 'Full canonical prompt with all rules' })
  expect(JSON.stringify(result)).not.toMatch(/access_token|ciphertext/)
  expect(fake.rpc).toHaveBeenCalledWith('mcp_prepare_work', expect.objectContaining({ p_actor: 'user', p_connection: 'connection', p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  await expect(call('prepare_feedback_work', { projectId: 'project', feedbackIds: [feedback, feedback], promptVersion: '1', idempotencyKey: 'unique-request-key' })).rejects.toThrow()
})
it('binds presence and progress to this connection, agent and prepared work', async () => {
  await call('report_agent_presence', { ...session, status: 'reading', summary: 'Connecting' })
  expect(fake.rpc).toHaveBeenLastCalledWith('mcp_work_operation', expect.objectContaining({ p_work: work, p_agent: 'worker', p_comment: null, p_op: 'reading' }))
  for (const action of ['claim', 'start', 'note', 'block', 'complete']) await call('update_feedback_progress', { ...progress, action })
  expect(fake.rpc).toHaveBeenLastCalledWith('mcp_work_operation', expect.objectContaining({ p_comment: feedback, p_op: 'complete', p_key: progress.idempotencyKey }))
  fake.query.mockResolvedValueOnce({ data: null, error: null })
  await expect(call('update_feedback_progress', progress)).rejects.toThrow('work_unavailable')
  fake.query.mockResolvedValueOnce({ data: null, error: new Error('private query') })
  await expect(call('update_feedback_progress', progress)).rejects.toThrow('storage_unavailable')
})
it('fails closed for missing scopes, guest membership and unavailable agent entitlement', async () => {
  for (const [name, args] of [['set_feedback_status', status], ['update_feedback_progress', progress]] as const) await expect(call(name, args, { ...actor, scope: 'crrt:read' })).rejects.toThrow('insufficient_scope')
  fake.permission.mockResolvedValueOnce('guest')
  await expect(call('set_feedback_status', status)).rejects.toThrow('forbidden')
  fake.entitlement.mockResolvedValueOnce({ state: 'upgrade_required' })
  await expect(call('update_feedback_progress', progress)).rejects.toThrow('agent_access_required')
  expect(fake.rpc).not.toHaveBeenCalled()
})
it('maps reviewer decisions to the atomic status RPC and reuses rejection sync', async () => {
  for (const target of ['ready_for_agent', 'open', 'rejected', 'ready_for_testing', 'done']) {
    fake.rpc.mockResolvedValueOnce({ data: { projectId: 'project', feedbackId: feedback, reviewStatus: target === 'open' ? 'open' : target === 'rejected' ? 'rejected' : 'accepted', implementationStatus: target === 'done' ? 'done' : 'unassigned', updatedAt: status.expectedUpdatedAt }, error: null })
    await call('set_feedback_status', { ...status, status: target })
  }
  expect(fake.rpc).toHaveBeenCalledWith('mcp_set_feedback_status', expect.objectContaining({ p_actor: 'user', p_reason: status.reason, p_expected: status.expectedUpdatedAt }))
  expect(fake.close).toHaveBeenCalledWith('project', feedback, status.expectedUpdatedAt)
  expect(fake.wait).toHaveBeenCalledOnce()
  fake.close.mockRejectedValueOnce(new Error('private provider error'))
  await call('set_feedback_status', { ...status, status: 'rejected' })
  await expect(fake.wait.mock.calls[1][0]).resolves.toBeUndefined()
  await expect(call('set_feedback_status', { ...status, userRequested: false })).rejects.toThrow()
})
it('exposes controlled errors without database or credential details', async () => {
  for (const [message, expected] of [['idempotency_conflict', 'idempotency_conflict'], ['forbidden', 'forbidden'], ['cloud_plan_limit: private', 'plan_limit'], ['database private secret', 'storage_unavailable']]) {
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message } })
    await expect(call('update_feedback_progress', progress)).rejects.toThrow(expected)
  }
})

it('does not schedule external changes when the atomic status transaction fails', async () => {
  fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private event failure' } })
  await expect(call('set_feedback_status', { ...status, status: 'rejected' })).rejects.toThrow('storage_unavailable')
  expect(fake.close).not.toHaveBeenCalled()
  expect(fake.wait).not.toHaveBeenCalled()
})
