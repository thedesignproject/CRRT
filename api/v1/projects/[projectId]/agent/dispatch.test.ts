import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../../../_lib/billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: vi.fn() }))
vi.mock('../../../../_lib/agent-dispatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../_lib/agent-dispatch.js')>()), deliveryState: vi.fn(), dispatchRpc: vi.fn(),
}))

import handler from './dispatch.js'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { resolveWidgetAgentAccess } from '../../../../_lib/billing/agent-entitlement.js'
import { DispatchError, deliveryState, dispatchRpc } from '../../../../_lib/agent-dispatch.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(name: string, value: string) { this.headers[name] = value },
  }
}
const id = '11111111-1111-4111-8111-111111111111'
const input = { listenerId: id, commentId: id, expectedUpdatedAt: '2026-11-26T10:00:00.123456+00:00', idempotencyKey: id }
async function call(method = 'GET', body: unknown = input, projectId: unknown = 'p') {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, body, query: { projectId }, headers: {} }, res)
  return res
}
const delivery = { listeners: [{ listenerId: id, label: 'Codex', repoUrl: 'https://github.com/a/b', online: true, stopped: false }], dispatches: [] }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(resolveWidgetAgentAccess).mockReset().mockResolvedValue({ state: 'ready' })
  vi.mocked(deliveryState).mockReset().mockResolvedValue(delivery)
  vi.mocked(dispatchRpc).mockReset().mockResolvedValue({ dispatchId: 'd', state: 'queued' })
})

it('answers preflight, rejects other methods, signed-out users and a missing project', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('DELETE')).statusCode).toBe(405)
  expect((await call('GET', undefined, '')).statusCode).toBe(400)
  vi.mocked(requireUser).mockResolvedValueOnce(null)
  await call()
  expect(requireProjectCapability).toHaveBeenCalledTimes(0)
  expect(deliveryState).not.toHaveBeenCalled()
})

it('lists listeners and dispatches for members who may operate agents, never cached', async () => {
  const res = await call()
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual(delivery)
  expect(res.headers['Cache-Control']).toBe('no-store')
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), { userId: 'u', email: 'a@b.c' }, 'p', 'agent:operate')
  expect(resolveWidgetAgentAccess).toHaveBeenCalledWith('p', 'u')
  expect(deliveryState).toHaveBeenCalledWith('p', 'u')
})

it('refuses members without Agent access before reading or sending', async () => {
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call('POST')
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValueOnce({ state: 'upgrade_required' })
  const res = await call('POST')
  expect(res.statusCode).toBe(402)
  expect(res.body).toMatchObject({ code: 'upgrade_required' })
  expect(dispatchRpc).not.toHaveBeenCalled()
  expect(deliveryState).not.toHaveBeenCalled()
})

it('sends one comment as the signed-in user and rejects malformed requests', async () => {
  const res = await call('POST')
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ dispatchId: 'd', state: 'queued' })
  expect(dispatchRpc).toHaveBeenCalledWith('agent_dispatch_send', { p_actor: 'u', p_project: 'p', p_listener: input.listenerId, p_comment: input.commentId, p_expected: input.expectedUpdatedAt, p_key: input.idempotencyKey })
  for (const body of [{ ...input, actor: 'forged' }, { ...input, idempotencyKey: 'not-a-uuid' }, { ...input, expectedUpdatedAt: 'yesterday' }, null]) {
    const bad = await call('POST', body)
    expect(bad.statusCode).toBe(400)
    expect(bad.body).toEqual({ error: 'Invalid send request', code: 'invalid_request' })
  }
  expect(dispatchRpc).toHaveBeenCalledTimes(1)
})

it.each([[409, 'listener_offline'], [409, 'feedback_changed'], [409, 'already_sent'], [403, 'forbidden']])('returns %i %s as { error, code }', async (status, code) => {
  vi.mocked(dispatchRpc).mockRejectedValueOnce(new DispatchError(status, code))
  const res = await call('POST')
  expect(res.statusCode).toBe(status)
  expect(res.body).toEqual({ error: code, code })
})

it('hides unexpected failures', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(deliveryState).mockRejectedValueOnce(new Error('secret'))
  const res = await call()
  expect(res.statusCode).toBe(503)
  expect(res.body).toEqual({ error: 'dispatch_unavailable', code: 'dispatch_unavailable' })
  expect(log).toHaveBeenCalled()
})
