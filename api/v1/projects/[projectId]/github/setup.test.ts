import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/github-app.js', () => ({
  createGitHubAppSetupAuthState: vi.fn(() => 'setup-auth-state'),
  verifyGitHubAppInstallState: vi.fn(() => ({
    projectKey: 'p',
    userId: 'u',
    origin: 'https://app.example',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })),
}))
vi.mock('../../../../_lib/widget-github-auth.js', () => ({
  buildGitHubAuthorizeUrl: vi.fn(() => 'https://github.com/login/oauth/authorize?state=setup-auth-state'),
}))

import handler from './setup.js'
import {
  createGitHubAppSetupAuthState,
  verifyGitHubAppInstallState,
} from '../../../../_lib/github-app.js'
import { buildGitHubAuthorizeUrl } from '../../../../_lib/widget-github-auth.js'

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
  vi.mocked(createGitHubAppSetupAuthState).mockClear()
  vi.mocked(verifyGitHubAppInstallState).mockReset().mockReturnValue({
    projectKey: 'p',
    userId: 'u',
    origin: 'https://app.example',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })
  vi.mocked(buildGitHubAuthorizeUrl).mockClear()
})

describe('api/v1/projects/[projectId]/github/setup', () => {
  it('validates method, query, and install state', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    res = mockRes()
    await call({ method: 'GET', query: { installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(verifyGitHubAppInstallState).mockReturnValueOnce({
      projectKey: 'other',
      userId: 'u',
      origin: 'https://app.example',
      nonce: 'n',
      iat: 1,
      exp: 2,
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(verifyGitHubAppInstallState).mockReturnValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('redirects to GitHub OAuth verification from GitHub callback params and rejects client-shaped params', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(302)
    expect(verifyGitHubAppInstallState).toHaveBeenCalledWith('state')
    expect(createGitHubAppSetupAuthState).toHaveBeenCalledWith({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
    })
    expect(buildGitHubAuthorizeUrl).toHaveBeenCalledWith('setup-auth-state')
    expect(res.headers.Location).toBe('https://github.com/login/oauth/authorize?state=setup-auth-state')

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installationId: '99', installState: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(createGitHubAppSetupAuthState).mockImplementationOnce(() => {
      throw new Error('secret missing')
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', installation_id: '99', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
