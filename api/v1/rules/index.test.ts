import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listRulesForUser: vi.fn(), createBrainRule: vi.fn() }))

import handler from './index.js'
import { requireProjectCapability, requireUser } from '../../_lib/auth.js'
import { createBrainRule, listRulesForUser } from '../../_lib/store.js'

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
async function call(method: string, body?: unknown) {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, body, query: {}, headers: {} }, res)
  return res
}
const rule = { id: 'r', title: 'T', body: 'B', projectKey: null, authorUserId: 'u', createdAt: 'c', updatedAt: 'c' }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'admin' })
  vi.mocked(listRulesForUser).mockReset().mockResolvedValue([{ ...rule, mine: true, citations: 3 }])
  vi.mocked(createBrainRule).mockReset().mockResolvedValue(rule)
})

it('answers preflight and rejects other methods', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('PUT')).statusCode).toBe(405)
})

it('stops when the user is not signed in', async () => {
  vi.mocked(requireUser).mockImplementation(async (_req, res) => {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  })
  expect((await call('GET')).statusCode).toBe(401)
  expect(listRulesForUser).not.toHaveBeenCalled()
})

it('lists the rules the user can see', async () => {
  const res = await call('GET')
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ rules: [{ ...rule, mine: true, citations: 3 }] })
  expect(listRulesForUser).toHaveBeenCalledWith('u')
})

it('creates a trimmed workspace rule owned by the caller', async () => {
  const res = await call('POST', { title: '  T  ', body: ' B ' })
  expect(res.statusCode).toBe(201)
  expect(res.body).toEqual({ rule })
  expect(createBrainRule).toHaveBeenCalledWith('u', null, 'T', 'B')
  expect(requireProjectCapability).not.toHaveBeenCalled()
})

it('creates a project rule only with project:manage', async () => {
  expect((await call('POST', { title: 'T', body: 'B', projectKey: 'p' })).statusCode).toBe(201)
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), { userId: 'u', email: 'a@b.c' }, 'p', 'project:manage')
  expect(createBrainRule).toHaveBeenCalledWith('u', 'p', 'T', 'B')
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call('POST', { title: 'T', body: 'B', projectKey: 'p' })
  expect(createBrainRule).toHaveBeenCalledTimes(1)
})

it('rejects invalid titles, bodies and project keys', async () => {
  for (const body of [undefined, { body: 'B' }, { title: ' ', body: 'B' }, { title: 'x'.repeat(121), body: 'B' }, { title: 'T', body: 5 }, { title: 'T', body: 'x'.repeat(4001) }]) {
    const res = await call('POST', body)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'A rule needs a title of 1 to 120 characters and a body of 1 to 4000' })
  }
  for (const projectKey of ['', 5]) expect((await call('POST', { title: 'T', body: 'B', projectKey })).statusCode).toBe(400)
  expect((await call('POST', { title: 'x'.repeat(120), body: 'x'.repeat(4000), projectKey: null })).statusCode).toBe(201)
  expect(createBrainRule).toHaveBeenCalledTimes(1)
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(listRulesForUser).mockRejectedValueOnce(new Error('boom'))
  expect((await call('GET')).statusCode).toBe(500)
})
