// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ handoff: vi.fn(), permission: vi.fn() }))
vi.mock('../../api/_lib/agent-dispatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/_lib/agent-dispatch.js')>()), dispatchRpc: vi.fn(), listListeners: vi.fn(),
}))
vi.mock('../../api/_lib/tokens.js', () => ({ generateAccessToken: () => 'private-token', generateSlug: () => 'slug', hashToken: () => 'hash', encryptToken: () => 'encrypted' }))
vi.mock('./context.js', () => ({ contextTools: [{}, { run: fake.handoff }] }))
vi.mock('./actions.js', () => ({ actionTools: [], permission: fake.permission }))
import { DispatchError, dispatchRpc, listListeners } from '../../api/_lib/agent-dispatch.js'
import { McpError } from './auth.js'
import { listenerInstructions, listenerTools } from './listeners.js'

const actor = { user_id: randomUUID(), connection_id: randomUUID(), email: 'test@example.com', scope: 'crrt:read crrt:implement' }
const listenerId = randomUUID(), projectId = 'project'
const start = { projectId, listenerId, label: 'Codex', repositoryUrl: 'https://github.com/a/b', userRequested: true }
const tool = (name: string) => listenerTools.find(spec => spec.name === name)!
const run = (name: string, input: Record<string, unknown>, who = actor) => tool(name).run(input, who)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(dispatchRpc).mockResolvedValue({})
  vi.mocked(listListeners).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

it('needs crrt:implement and an explicit user request to start or stop', async () => {
  expect(listenerTools.map(spec => spec.name)).toEqual(['start_feedback_listener', 'list_feedback_listeners', 'wait_for_feedback', 'stop_feedback_listener'])
  for (const spec of listenerTools) {
    expect(spec.scope).toBe('crrt:implement')
    await expect(spec.run({}, { ...actor, scope: 'crrt:read' })).rejects.toMatchObject({ code: 'insufficient_scope' })
  }
  expect(tool('start_feedback_listener').input.safeParse({ ...start, userRequested: false }).success).toBe(false)
  expect(tool('stop_feedback_listener').input.safeParse({ listenerId }).success).toBe(false)
})

it('registers this connection’s listener, by default for the connected user only', async () => {
  vi.mocked(dispatchRpc).mockResolvedValueOnce({ listenerId, projectId, label: 'Codex', repoUrl: start.repositoryUrl })
  expect(await run('start_feedback_listener', start)).toEqual({ listenerId, projectId, label: 'Codex', repoUrl: start.repositoryUrl, instructions: listenerInstructions })
  expect(dispatchRpc).toHaveBeenCalledWith('agent_listener_register', { p_actor: actor.user_id, p_connection: actor.connection_id, p_id: listenerId,
    p_project: projectId, p_label: 'Codex', p_repo: start.repositoryUrl, p_senders: [actor.user_id] })
  const member = randomUUID()
  await run('start_feedback_listener', { ...start, senderIds: [actor.user_id, member] })
  expect(dispatchRpc).toHaveBeenLastCalledWith('agent_listener_register', expect.objectContaining({ p_senders: [actor.user_id, member] }))
})

it('lists only this connection’s listeners after checking Agent access, and stops without deleting queued work', async () => {
  expect(await run('list_feedback_listeners', { projectId })).toEqual({ listeners: [] })
  expect(fake.permission).toHaveBeenCalledWith(actor, projectId, 'crrt:implement')
  expect(listListeners).toHaveBeenCalledWith(projectId, actor.user_id, actor.connection_id)
  fake.permission.mockRejectedValueOnce(new McpError(403, 'agent_access_required'))
  await expect(run('list_feedback_listeners', { projectId })).rejects.toMatchObject({ code: 'agent_access_required' })
  expect(await run('stop_feedback_listener', { listenerId, userRequested: true })).toEqual({ listenerId, stopped: true })
  expect(dispatchRpc).toHaveBeenCalledWith('agent_listener_stop', { p_actor: actor.user_id, p_connection: actor.connection_id, p_id: listenerId })
})

it('returns received work with its full handoff context and no share credentials', async () => {
  vi.mocked(dispatchRpc).mockResolvedValue({ state: 'received', workId: 'work', feedbackId: 'feedback', projectId })
  fake.handoff.mockResolvedValue({ implementationPrompt: 'full prompt', untrustedData: true })
  const result = await run('wait_for_feedback', { listenerId, waitSeconds: 0 })
  expect(result).toMatchObject({ state: 'received', workId: 'work', promptVersion: '1', context: { implementationPrompt: 'full prompt' }, instructions: listenerInstructions })
  expect(JSON.stringify(result)).not.toContain('private-token')
  expect(fake.handoff).toHaveBeenCalledWith({ projectId, feedbackIds: ['feedback'] }, actor)
  expect(dispatchRpc).toHaveBeenCalledWith('agent_listener_poll', { p_actor: actor.user_id, p_connection: actor.connection_id, p_id: listenerId,
    p_share: { scope_type: 'selection', slug: 'slug', access_token_hash: 'hash', access_token_ciphertext: 'encrypted', expires_at: expect.any(String) } })
})

it('polls within the requested bound and returns cancelled work at once', async () => {
  vi.useFakeTimers()
  vi.mocked(dispatchRpc).mockResolvedValue({ state: 'waiting' })
  const pending = run('wait_for_feedback', { listenerId, waitSeconds: 3 })
  await vi.advanceTimersByTimeAsync(3000)
  expect(await pending).toEqual({ state: 'waiting', instructions: listenerInstructions })
  expect(dispatchRpc).toHaveBeenCalledTimes(3)
  vi.mocked(dispatchRpc).mockResolvedValue({ state: 'cancelled', reason: 'feedback_changed' })
  expect(await run('wait_for_feedback', { listenerId })).toMatchObject({ state: 'cancelled', reason: 'feedback_changed' })
})

it('turns dispatch errors into MCP errors and passes other failures through', async () => {
  vi.mocked(dispatchRpc).mockRejectedValueOnce(new DispatchError(409, 'listener_stopped'))
  await expect(run('wait_for_feedback', { listenerId })).rejects.toMatchObject({ status: 409, code: 'listener_stopped' })
  vi.mocked(dispatchRpc).mockRejectedValueOnce(new Error('unexpected'))
  await expect(run('start_feedback_listener', start)).rejects.toThrow('unexpected')
})
