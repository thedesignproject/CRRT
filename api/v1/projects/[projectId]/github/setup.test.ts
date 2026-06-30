import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/github-app.js', () => ({
  assertGitHubUserInstallationAccess: vi.fn(),
  createGitHubAppInstallationToken: vi.fn(() => 'installation-token'),
  verifyGitHubAppInstallState: vi.fn(() => ({
    projectKey: 'p',
    userId: 'u',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })),
}))
vi.mock('../../../../_lib/store.js', () => ({ getProjectMember: vi.fn() }))

import handler from './setup.js'
import { requireUser } from '../../../../_lib/auth.js'
import {
  assertGitHubUserInstallationAccess,
  createGitHubAppInstallationToken,
  verifyGitHubAppInstallState,
} from '../../../../_lib/github-app.js'
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
  vi.mocked(assertGitHubUserInstallationAccess).mockReset()
  vi.mocked(createGitHubAppInstallationToken).mockClear()
  vi.mocked(verifyGitHubAppInstallState).mockReset().mockReturnValue({
    projectKey: 'p',
    userId: 'u',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })
  vi.mocked(getProjectMember).mockReset()
})

describe('api/v1/projects/[projectId]/github/setup', () => {
  it('validates method, auth, query, admin role, and install state', async () => {
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
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    res = mockRes()
    await call({ method: 'GET', query: { installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
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
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
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
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    vi.mocked(verifyGitHubAppInstallState).mockReturnValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns an installation token from GitHub callback params and rejects client-shaped params', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(verifyGitHubAppInstallState).toHaveBeenCalledWith('state')
    expect(assertGitHubUserInstallationAccess).toHaveBeenCalledWith('ghu_1', '99')
    expect(createGitHubAppInstallationToken).toHaveBeenCalledWith({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
    })
    expect(res.body).toEqual({ installationToken: 'installation-token' })

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(assertGitHubUserInstallationAccess).mockRejectedValueOnce(new Error('github_installation_inaccessible'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: 'other', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: { 'x-github-user-token': 'ghu_1' } }, res)
    expect(res.statusCode).toBe(500)
  })
})
