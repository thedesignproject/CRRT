import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ getBrainRuleScope: vi.fn(), getProjectMember: vi.fn(), updateBrainRule: vi.fn(), deleteBrainRule: vi.fn() }))

import handler from './[ruleId].js'
import { requireUser } from '../../_lib/auth.js'
import { deleteBrainRule, getBrainRuleScope, getProjectMember, updateBrainRule } from '../../_lib/store.js'

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
const ruleId = '11111111-1111-4111-8111-111111111111'
async function call(method: string, body?: unknown, id: unknown = ruleId) {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, body, query: { ruleId: id }, headers: {} }, res)
  return res
}
const rule = { id: ruleId, title: 'T', body: 'B', projectKey: 'p', authorUserId: 'u', createdAt: 'c', updatedAt: 'd' }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(getBrainRuleScope).mockReset().mockResolvedValue({ ownerUserId: 'u', projectKey: null })
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'admin', feedbackAllowed: true })
  vi.mocked(updateBrainRule).mockReset().mockResolvedValue(rule)
  vi.mocked(deleteBrainRule).mockReset().mockResolvedValue()
})

it('answers preflight, rejects other methods and stops signed-out users', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('GET')).statusCode).toBe(405)
  vi.mocked(requireUser).mockImplementationOnce(async (_req, res) => {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  })
  expect((await call('DELETE')).statusCode).toBe(401)
  expect(getBrainRuleScope).not.toHaveBeenCalled()
})

it('returns 404 for a missing or malformed rule id', async () => {
  expect((await call('DELETE', undefined, '')).statusCode).toBe(404)
  expect((await call('DELETE', undefined, 'nope')).statusCode).toBe(404)
  vi.mocked(getBrainRuleScope).mockResolvedValueOnce(null)
  expect((await call('DELETE')).statusCode).toBe(404)
})

it('lets the owner update and delete a workspace rule, and hides it from others', async () => {
  const res = await call('PATCH', { title: ' New ', body: undefined })
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ rule })
  expect(updateBrainRule).toHaveBeenCalledWith(ruleId, { title: 'New' })
  expect((await call('DELETE')).statusCode).toBe(204)
  expect(deleteBrainRule).toHaveBeenCalledWith(ruleId)
  expect(getProjectMember).not.toHaveBeenCalled()
  vi.mocked(getBrainRuleScope).mockResolvedValueOnce({ ownerUserId: 'other', projectKey: null })
  expect((await call('DELETE')).statusCode).toBe(404)
  expect(deleteBrainRule).toHaveBeenCalledTimes(1)
})

it('needs project:manage for project rules: 403 when visible, 404 when not', async () => {
  vi.mocked(getBrainRuleScope).mockResolvedValue({ ownerUserId: 'owner', projectKey: 'p' })
  expect((await call('PATCH', { body: ' B ' })).statusCode).toBe(200)
  expect(updateBrainRule).toHaveBeenCalledWith(ruleId, { body: 'B' })
  expect(getProjectMember).toHaveBeenCalledWith('u', 'p')
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member', feedbackAllowed: true })
  expect((await call('DELETE')).statusCode).toBe(403)
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member', feedbackAllowed: false })
  expect((await call('DELETE')).statusCode).toBe(404)
  vi.mocked(getProjectMember).mockResolvedValueOnce(null)
  expect((await call('DELETE')).statusCode).toBe(404)
  // A stale owner_user_id grants nothing once the caller has left the project.
  vi.mocked(getBrainRuleScope).mockResolvedValueOnce({ ownerUserId: 'u', projectKey: 'p' })
  vi.mocked(getProjectMember).mockResolvedValueOnce(null)
  expect((await call('DELETE')).statusCode).toBe(404)
  expect(deleteBrainRule).not.toHaveBeenCalled()
})

it('rejects an empty or invalid patch', async () => {
  for (const body of [undefined, {}, { title: '' }, { title: 'x'.repeat(121) }, { body: 'x'.repeat(4001) }, { title: 'T', body: ' ' }]) {
    const res = await call('PATCH', body)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'A rule needs a title of 1 to 120 characters and a body of 1 to 4000' })
  }
  expect(updateBrainRule).not.toHaveBeenCalled()
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(updateBrainRule).mockRejectedValueOnce(new Error('boom'))
  expect((await call('PATCH', { title: 'T' })).statusCode).toBe(500)
})
