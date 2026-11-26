import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listAgentRuns: vi.fn(), listProjectsForUser: vi.fn() }))

import handler from './index.js'
import { requireProjectCapability, requireUser } from '../../_lib/auth.js'
import { listAgentRuns, listProjectsForUser } from '../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader() {},
  }
}
async function call(query: Record<string, unknown> = {}, method = 'GET') {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, query, headers: {} }, res)
  return res
}
const run = { id: 's:a', projectKey: 'p', agentLabel: 'a', startedAt: 'x', endedAt: 'y', steps: 2, commentsCompleted: 1, outcome: 'completed' as const }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(listAgentRuns).mockReset().mockResolvedValue([run])
  vi.mocked(listProjectsForUser).mockReset().mockResolvedValue([
    { publicKey: 'p', capabilities: ['feedback:read', 'agent:operate'] },
    { publicKey: 'g', capabilities: ['feedback:read'] },
  ] as never)
})

it('answers preflight, rejects other methods and signed-out users', async () => {
  expect((await call({}, 'OPTIONS')).statusCode).toBe(204)
  expect((await call({}, 'POST')).statusCode).toBe(405)
  vi.mocked(requireUser).mockResolvedValueOnce(null)
  await call()
  expect(listAgentRuns).not.toHaveBeenCalled()
})

it('rejects a limit that is not an integer from 1 to 200', async () => {
  for (const limit of ['0', '201', '1.5', 'x']) expect((await call({ limit })).statusCode).toBe(400)
  expect(listAgentRuns).not.toHaveBeenCalled()
})

it('lists runs across every project where the user may operate agents', async () => {
  const res = await call()
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ runs: [run] })
  expect(listProjectsForUser).toHaveBeenCalledWith('u')
  expect(listAgentRuns).toHaveBeenCalledWith(['p'], 50)
  expect(requireProjectCapability).not.toHaveBeenCalled()
})

it('lists one project\'s runs when the user may operate agents on it', async () => {
  expect((await call({ project: 'p', limit: '200' })).statusCode).toBe(200)
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), { userId: 'u', email: 'a@b.c' }, 'p', 'agent:operate')
  expect(listAgentRuns).toHaveBeenCalledWith(['p'], 200)
  expect(listProjectsForUser).not.toHaveBeenCalled()
  vi.mocked(requireProjectCapability).mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden' })
    return null
  })
  expect((await call({ project: 'g' })).statusCode).toBe(403)
  expect(listAgentRuns).toHaveBeenCalledTimes(1)
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(listAgentRuns).mockRejectedValueOnce(new Error('boom'))
  expect((await call()).statusCode).toBe(500)
})
