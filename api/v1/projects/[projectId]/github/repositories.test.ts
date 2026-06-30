import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/github-app.js', () => ({
  listInstallationRepositories: vi.fn(),
  verifyGitHubAppInstallState: vi.fn(() => ({ projectKey: 'p', userId: 'u', nonce: 'n', iat: 1, exp: 2 })),
}))
vi.mock('../../../../_lib/store.js', () => ({ getProjectMember: vi.fn() }))

import handler from './repositories.js'
import { requireUser } from '../../../../_lib/auth.js'
import { listInstallationRepositories, verifyGitHubAppInstallState } from '../../../../_lib/github-app.js'
import { getProjectMember } from '../../../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(listInstallationRepositories).mockReset()
  vi.mocked(verifyGitHubAppInstallState).mockReset().mockReturnValue({
    projectKey: 'p',
    userId: 'u',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })
  vi.mocked(getProjectMember).mockReset()
})

describe('api/v1/projects/[projectId]/github/repositories', () => {
  it('validates method, auth, query, and admin role', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' })
      return null
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    res = mockRes()
    await call({ method: 'GET', query: { installationId: '99' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    vi.mocked(verifyGitHubAppInstallState).mockReturnValueOnce({
      projectKey: 'other',
      userId: 'u',
      nonce: 'n',
      iat: 1,
      exp: 2,
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    vi.mocked(verifyGitHubAppInstallState).mockReturnValueOnce({
      projectKey: 'p',
      userId: 'other',
      nonce: 'n',
      iat: 1,
      exp: 2,
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns repositories and maps unexpected errors', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(listInstallationRepositories).mockResolvedValueOnce([{ fullName: 'acme/widgets' }] as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ repositories: [{ fullName: 'acme/widgets' }] })
    expect(verifyGitHubAppInstallState).toHaveBeenCalledWith('state')
    expect(listInstallationRepositories).toHaveBeenCalledWith('99')

    vi.mocked(listInstallationRepositories).mockRejectedValueOnce(new Error('github down'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
