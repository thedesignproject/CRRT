import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../../../_lib/store.js', () => ({ getGithubIssueConnection: vi.fn(), getProjectIntegration: vi.fn() }))

import handler from './index.js'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { getGithubIssueConnection, getProjectIntegration } from '../../../../_lib/store.js'

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

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(getGithubIssueConnection).mockReset().mockResolvedValue({ owner: 'o', repo: 'r', installationId: '1', connectionVersion: 1 })
  vi.mocked(getProjectIntegration).mockReset().mockImplementation(async (_project, provider) => (
    provider === 'linear' ? { containerId: 'team' } : { containerId: null }
  ) as never)
})

it('answers preflight, rejects other methods, signed-out users and a missing project', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('POST')).statusCode).toBe(405)
  expect((await call('GET', '')).statusCode).toBe(400)
  vi.mocked(requireUser).mockResolvedValueOnce(null)
  await call()
  expect(getGithubIssueConnection).not.toHaveBeenCalled()
})

it('reports each tracker with a saved destination as connected', async () => {
  const res = await call()
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ github: { connected: true }, linear: { connected: true }, jira: { connected: false } })
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), { userId: 'u', email: 'a@b.c' }, 'p', 'integrations:send')
  expect(getProjectIntegration).toHaveBeenCalledWith('p', 'jira')

  vi.mocked(getGithubIssueConnection).mockResolvedValueOnce(null)
  vi.mocked(getProjectIntegration).mockResolvedValue(null)
  expect((await call()).body).toEqual({ github: { connected: false }, linear: { connected: false }, jira: { connected: false } })
})

it('stops at the capability check and returns 500 when the store fails', async () => {
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call()
  expect(getGithubIssueConnection).not.toHaveBeenCalled()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getProjectIntegration).mockRejectedValueOnce(new Error('boom'))
  expect((await call()).statusCode).toBe(500)
})
