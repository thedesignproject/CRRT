import { beforeEach, expect, it, vi } from 'vitest'
import { listAccessRequests, submitAccessRequest, reviewAccessRequest } from './project-access-requests.js'
import { getServiceSupabase } from './supabase.js'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
const result = { data: [], error: null as null | { message: string } }
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) }
const client = { from: vi.fn(() => query), rpc: vi.fn(async () => result) }
beforeEach(() => {
  vi.clearAllMocks()
  result.error = null
  for (const method of ['select', 'eq', 'order'] as const) query[method].mockReturnValue(query)
  vi.mocked(getServiceSupabase).mockReturnValue(client as never)
})
it('scopes request listing and sends the authenticated actor to transactional RPCs', async () => {
  expect(await listAccessRequests('p')).toEqual([])
  expect(client.from).toHaveBeenCalledWith('project_access_requests')
  expect(query.eq.mock.calls).toEqual([['project_key', 'p'], ['status', 'pending']])
  await submitAccessRequest('p', 'u')
  expect(client.rpc).toHaveBeenCalledWith('submit_project_access_request', { p_project: 'p', p_user: 'u' })
  await reviewAccessRequest('p', 'r', 'admin', 2, 'approved', 'guest')
  expect(client.rpc).toHaveBeenCalledWith('review_project_access_request', { p_project: 'p', p_request: 'r', p_reviewer: 'admin', p_attempt: 2, p_decision: 'approved', p_role: 'guest' })
})
it('propagates storage failures', async () => {
  result.error = { message: 'failed' }
  for (const operation of [() => listAccessRequests('p'), () => submitAccessRequest('p', 'u'), () => reviewAccessRequest('p', 'r', 'a', 1, 'declined', 'member')]) await expect(operation()).rejects.toThrow('failed')
})
