import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ getNextStep: vi.fn(), getProjectMember: vi.fn(), listNextSteps: vi.fn(), answerNextStepConflict: vi.fn() }))

import handler from './conflict.js'
import { requireUser } from '../../../_lib/auth.js'
import { answerNextStepConflict, getNextStep, getProjectMember, listNextSteps } from '../../../_lib/store.js'

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
const stepId = '11111111-1111-4111-8111-111111111111'
async function call(method = 'POST', body: unknown = { decision: 'keep_rule' }, id: unknown = stepId) {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, body, query: { stepId: id }, headers: {} }, res)
  return res
}
const conflict = { ruleId: 'r', ruleTitle: 'Brand blue', question: 'Red?', decision: null }
const paused = { id: stepId, title: 'T', tag: '/', status: 'paused' as const, createdAt: 'c', comments: [], requesters: [], citations: [], conflict }

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(getNextStep).mockReset().mockResolvedValue({ projectKey: 'p', status: 'paused', incompleteCommentIds: [] })
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'member', feedbackAllowed: true })
  vi.mocked(listNextSteps).mockReset().mockResolvedValue([paused])
  vi.mocked(answerNextStepConflict).mockReset().mockResolvedValue(true)
})

it('answers preflight and rejects other methods, signed-out users and bad input', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('GET')).statusCode).toBe(405)
  vi.mocked(requireUser).mockResolvedValueOnce(null)
  await call()
  for (const id of ['', 'nope']) expect((await call('POST', undefined, id)).statusCode).toBe(404)
  for (const body of [null, {}, { decision: 'ignore' }]) {
    const res = await call('POST', body)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'decision must be keep_rule or update_rule' })
  }
  expect(getNextStep).not.toHaveBeenCalled()
})

it('records the decision and reopens the paused step', async () => {
  const res = await call('POST', { decision: 'update_rule' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ step: { ...paused, status: 'open', conflict: { ...conflict, decision: 'update_rule' } } })
  expect(getProjectMember).toHaveBeenCalledWith('u', 'p')
  expect(listNextSteps).toHaveBeenCalledWith('p')
  expect(answerNextStepConflict).toHaveBeenCalledWith(stepId, 'update_rule')
})

it('hides unknown steps and projects the user cannot see, and forbids those without agent:operate', async () => {
  vi.mocked(getNextStep).mockResolvedValueOnce(null)
  expect((await call()).statusCode).toBe(404)
  vi.mocked(getProjectMember).mockResolvedValueOnce(null)
  expect((await call()).statusCode).toBe(404)
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member', feedbackAllowed: false })
  expect((await call()).statusCode).toBe(404)
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'guest', feedbackAllowed: true })
  expect((await call()).statusCode).toBe(403)
  expect(answerNextStepConflict).not.toHaveBeenCalled()
})

it('returns 409 when the step is not paused or stops being paused', async () => {
  vi.mocked(listNextSteps).mockResolvedValueOnce([{ ...paused, status: 'open' }])
  expect((await call()).statusCode).toBe(409)
  vi.mocked(listNextSteps).mockResolvedValueOnce([])
  expect((await call()).statusCode).toBe(409)
  expect(answerNextStepConflict).not.toHaveBeenCalled()
  vi.mocked(answerNextStepConflict).mockResolvedValueOnce(false)
  const res = await call()
  expect(res.statusCode).toBe(409)
  expect(res.body).toEqual({ error: 'This step is not waiting for an answer' })
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getNextStep).mockRejectedValueOnce(new Error('boom'))
  expect((await call()).statusCode).toBe(500)
})
