import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ listNextSteps: vi.fn() }))

import handler from './next-steps.js'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import { listNextSteps } from '../../../_lib/store.js'

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
async function call(method = 'GET', projectId: unknown = 'p') {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, query: { projectId }, headers: {} }, res)
  return res
}
const step = { id: 's', title: 'T', tag: '/', status: 'open' as const, createdAt: 'c', comments: [], requesters: [], citations: [], conflict: null }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(listNextSteps).mockReset().mockResolvedValue([step])
})

it('answers preflight, rejects other methods, signed-out users and a missing project', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('POST')).statusCode).toBe(405)
  expect((await call('GET', '')).statusCode).toBe(400)
  vi.mocked(requireUser).mockResolvedValueOnce(null)
  await call()
  expect(listNextSteps).not.toHaveBeenCalled()
})

it('lists next steps for users who may operate agents on the project', async () => {
  const res = await call()
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ steps: [step] })
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), { userId: 'u', email: 'a@b.c' }, 'p', 'agent:operate')
  expect(listNextSteps).toHaveBeenCalledWith('p')
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call()
  expect(listNextSteps).toHaveBeenCalledTimes(1)
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(listNextSteps).mockRejectedValueOnce(new Error('boom'))
  expect((await call()).statusCode).toBe(500)
})
