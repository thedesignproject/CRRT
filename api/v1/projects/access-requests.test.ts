import { beforeEach, expect, it, vi } from 'vitest'
import requests from './[projectId]/access-requests/index.js'
import review from './[projectId]/access-requests/[requestId].js'
import { requireUser, requireProjectCapability } from '../../_lib/auth.js'
import { accessErrors, listAccessRequests, reviewAccessRequest, submitAccessRequest } from '../../_lib/project-access-requests.js'
vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../_lib/project-access-requests.js', async importOriginal => ({ ...await importOriginal<object>(), listAccessRequests: vi.fn(), reviewAccessRequest: vi.fn(), submitAccessRequest: vi.fn() }))
vi.mock('../../_lib/project-access-email.js', () => ({ scheduleAccessRequestEmail: vi.fn() }))
import { scheduleAccessRequestEmail } from '../../_lib/project-access-email.js'
const requestId = '11111111-1111-4111-8111-111111111111'
const row = { id: requestId, email: 'u@company.com', status: 'pending' } as never
async function call(handler = requests, method = 'POST', query: object = { projectId: 'p', requestId }, body?: unknown) {
  const res = { statusCode: 200, body: undefined as unknown, status(n: number) { this.statusCode = n; return this }, json(data: unknown) { this.body = data; return this }, end() {}, setHeader() {} }
  await handler({ method, query, body, headers: {} } as never, res as never)
  return res
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@company.com' })
  vi.mocked(requireProjectCapability).mockResolvedValue({ role: 'admin' })
  vi.mocked(listAccessRequests).mockResolvedValue([])
  vi.mocked(submitAccessRequest).mockResolvedValue({ outcome: 'created', request: row })
  vi.mocked(reviewAccessRequest).mockResolvedValue({ outcome: 'reviewed', request: row })
})
it('validates methods, session and route parameters', async () => {
  for (const handler of [requests, review]) {
    expect((await call(handler, 'OPTIONS')).statusCode).toBe(204)
    expect((await call(handler, 'PUT')).statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValueOnce(null)
    await call(handler, handler === review ? 'PATCH' : 'POST')
    expect((await call(handler, handler === review ? 'PATCH' : 'POST', {})).statusCode).toBe(400)
  }
  expect((await call(review, 'PATCH', { projectId: 'p' })).statusCode).toBe(400)
  expect((await call(review, 'PATCH', { projectId: 'p', requestId: 'bad' })).statusCode).toBe(400)
  expect(submitAccessRequest).not.toHaveBeenCalled()
  expect(reviewAccessRequest).not.toHaveBeenCalled()
})
it('requires manage permission for listing and binds submissions to the current user', async () => {
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call(requests, 'GET')
  expect(listAccessRequests).not.toHaveBeenCalled()
  expect((await call(requests, 'GET')).body).toEqual([])
  expect((await call(requests, 'POST', { projectId: 'p' }, { userId: 'other', email: 'spoof@example.com' })).statusCode).toBe(201)
  expect(submitAccessRequest).toHaveBeenCalledWith('p', 'u')
  vi.mocked(submitAccessRequest).mockResolvedValueOnce({ outcome: 'existing', request: row })
  expect((await call()).statusCode).toBe(200)
  expect(scheduleAccessRequestEmail).toHaveBeenCalledExactlyOnceWith(row)
})
it('validates review inputs and defaults to member without granting ownership', async () => {
  for (const body of [undefined, {}, { attempt: 1 }, { attempt: 1, decision: 'unknown' }, { attempt: 1, decision: 'approved', role: 'owner' }]) expect((await call(review, 'PATCH', { projectId: 'p', requestId }, body)).statusCode).toBe(400)
  expect((await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt: 1, decision: 'approved' })).body).toEqual(row)
  expect(reviewAccessRequest).toHaveBeenLastCalledWith('p', requestId, 'u', 1, 'approved', 'member')
  await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt: 1, decision: 'declined', role: 'guest' })
  expect(reviewAccessRequest).toHaveBeenLastCalledWith('p', requestId, 'u', 1, 'declined', 'guest')
})
it('maps eligibility, permission, cooldown, and stale-review errors without leaking data', async () => {
  for (const [outcome, [status]] of Object.entries(accessErrors)) {
    vi.mocked(submitAccessRequest).mockResolvedValueOnce({ outcome })
    expect((await call()).statusCode).toBe(status)
    vi.mocked(reviewAccessRequest).mockResolvedValueOnce({ outcome })
    expect((await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt: 1, decision: 'approved' })).statusCode).toBe(status)
  }
})
it('fails closed on malformed RPC results and database failures', async () => {
  vi.mocked(submitAccessRequest).mockResolvedValueOnce({ outcome: 'created' })
  expect((await call()).statusCode).toBe(500)
  vi.mocked(reviewAccessRequest).mockResolvedValueOnce({ outcome: 'reviewed' })
  expect((await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt: 1, decision: 'approved' })).statusCode).toBe(500)
  vi.mocked(listAccessRequests).mockRejectedValueOnce(new Error('offline'))
  expect((await call(requests, 'GET')).statusCode).toBe(500)
})

it('requires the displayed attempt and rejects missing, fractional, or unsafe attempt numbers', async () => {
  for (const attempt of [undefined, null, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    expect((await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt, decision: 'approved' })).statusCode).toBe(400)
  }
  expect(reviewAccessRequest).not.toHaveBeenCalled()
  vi.mocked(reviewAccessRequest).mockResolvedValueOnce({ outcome: 'stale' })
  expect((await call(review, 'PATCH', { projectId: 'p', requestId }, { attempt: 2, decision: 'approved', role: 'admin' })).statusCode).toBe(409)
  expect(reviewAccessRequest).toHaveBeenCalledWith('p', requestId, 'u', 2, 'approved', 'admin')
})
