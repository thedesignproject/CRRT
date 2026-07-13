import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/github-app.js', () => ({
  assertGitHubUserInstallationAccess: vi.fn(),
  createGitHubAppInstallationToken: vi.fn(() => 'installation-token'),
  listUserInstallationRepositories: vi.fn(() => [{ fullName: 'acme/widgets' }]),
  verifyGitHubAppSetupAuthState: vi.fn(() => null),
}))
vi.mock('../../../_lib/store.js', () => ({
  getGithubConnectionVersion: vi.fn(() => 0),
  getProjectMember: vi.fn(() => ({ role: 'admin' })),
  getRepoConfig: vi.fn(),
}))
vi.mock('../../../_lib/widget-github-auth.js', () => ({
  assertGitHubRepoAccess: vi.fn(),
  createWidgetAuthToken: vi.fn(() => 'widget-token'),
  exchangeGitHubCode: vi.fn(() => 'gh-token'),
  getGitHubUser: vi.fn(() => ({ id: '42', login: 'octo' })),
  verifyWidgetGithubState: vi.fn(() => ({ projectKey: 'p', origin: 'https://app.example' })),
  widgetCallbackHtml: vi.fn((origin, message) => `html:${origin}:${JSON.stringify(message)}`),
}))

import handler from './callback.js'
import {
  assertGitHubUserInstallationAccess,
  createGitHubAppInstallationToken,
  listUserInstallationRepositories,
  verifyGitHubAppSetupAuthState,
} from '../../../_lib/github-app.js'
import { getGithubConnectionVersion, getProjectMember, getRepoConfig } from '../../../_lib/store.js'
import {
  assertGitHubRepoAccess,
  createWidgetAuthToken,
  exchangeGitHubCode,
  getGitHubUser,
  verifyWidgetGithubState,
} from '../../../_lib/widget-github-auth.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    send(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(assertGitHubUserInstallationAccess).mockReset()
  vi.mocked(createGitHubAppInstallationToken).mockClear()
  vi.mocked(listUserInstallationRepositories).mockReset().mockResolvedValue([{ fullName: 'acme/widgets' }] as never)
  vi.mocked(verifyGitHubAppSetupAuthState).mockReset().mockReturnValue(null)
  vi.mocked(getGithubConnectionVersion).mockReset().mockResolvedValue(0)
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'admin' } as never)
  vi.mocked(getRepoConfig).mockReset()
  vi.mocked(assertGitHubRepoAccess).mockReset()
  vi.mocked(createWidgetAuthToken).mockClear()
  vi.mocked(exchangeGitHubCode).mockReset().mockResolvedValue('gh-token')
  vi.mocked(getGitHubUser).mockReset().mockResolvedValue({ id: '42', login: 'octo' })
  vi.mocked(verifyWidgetGithubState).mockReset().mockReturnValue({
    projectKey: 'p',
    origin: 'https://app.example',
    nonce: 'n',
    iat: 1,
    exp: 2,
  })
})

describe('api/v1/widget/github/callback', () => {
  it('handles options, method, query validation, and bad state', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    res = mockRes()
    await call({ method: 'GET', query: { code: 'c' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(verifyWidgetGithubState).mockReturnValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns popup errors for missing repo config and GitHub failures', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: null, githubRepo: null } as never)
    let res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('repo_not_configured')

    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    vi.mocked(assertGitHubRepoAccess).mockRejectedValueOnce(new Error('github_repo_inaccessible'))
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('github_repo_inaccessible')

    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    vi.mocked(exchangeGitHubCode).mockRejectedValueOnce(new Error('surprise'))
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(String(res.body)).toContain('github_auth_failed')
  })

  it('maps unexpected GitHub failures to a generic popup error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRepoConfig).mockResolvedValue({ githubOwner: 'acme', githubRepo: 'widgets' } as never)

    vi.mocked(exchangeGitHubCode).mockRejectedValueOnce(new Error('surprising'))
    let res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('github_auth_failed')
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockClear()
    vi.mocked(exchangeGitHubCode).mockRejectedValueOnce('surprising')
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('github_auth_failed')
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('exchanges the code, checks repo access, and returns a widget token', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    const res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(res.headers['Referrer-Policy']).toBe('no-referrer')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(res.headers['X-Frame-Options']).toBe('DENY')
    expect(exchangeGitHubCode).toHaveBeenCalledWith('c')
    expect(assertGitHubRepoAccess).toHaveBeenCalledWith('gh-token', 'acme', 'widgets')
    expect(getGitHubUser).toHaveBeenCalledWith('gh-token')
    expect(createWidgetAuthToken).toHaveBeenCalledWith({
      projectKey: 'p',
      githubUserId: '42',
      githubLogin: 'octo',
      githubOwner: 'acme',
      githubRepo: 'widgets',
    })
    expect(String(res.body)).toContain('widget-token')
  })

  it('verifies GitHub App installation access before returning an installation token', async () => {
    vi.mocked(verifyGitHubAppSetupAuthState).mockReturnValue({
      type: 'github_app_setup_auth_state',
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
      nonce: 'n',
      iat: 1,
      exp: 2,
    })
    vi.mocked(getGithubConnectionVersion).mockResolvedValue(7)

    let res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 'app-state' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(exchangeGitHubCode).toHaveBeenCalledWith('c')
    expect(assertGitHubUserInstallationAccess).toHaveBeenCalledWith('gh-token', '99')
    expect(listUserInstallationRepositories).toHaveBeenCalledWith('gh-token', '99')
    expect(createGitHubAppInstallationToken).toHaveBeenCalledWith({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      expectedConnectionVersion: 7,
    })
    expect(getProjectMember).toHaveBeenCalledWith('u', 'p')
    expect(getGithubConnectionVersion).toHaveBeenCalledWith('p')
    expect(getRepoConfig).not.toHaveBeenCalled()
    expect(String(res.body)).toContain('crrt:github-app-install')
    expect(String(res.body)).toContain('installation-token')
    expect(String(res.body)).toContain('acme/widgets')

    vi.mocked(assertGitHubUserInstallationAccess).mockRejectedValueOnce(new Error('github_installation_inaccessible'))
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 'app-state' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallationToken).toHaveBeenCalledTimes(1)
    expect(String(res.body)).toContain('github_app_install_failed')

    vi.mocked(listUserInstallationRepositories).mockRejectedValueOnce(new Error('github_installation_repos_failed'))
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 'app-state' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallationToken).toHaveBeenCalledTimes(1)
    expect(String(res.body)).toContain('github_app_install_failed')

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(exchangeGitHubCode).mockRejectedValueOnce(new Error('surprise'))
    res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 'app-state' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallationToken).toHaveBeenCalledTimes(1)
    expect(String(res.body)).toContain('github_app_install_failed')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('rejects an installation callback after the initiating admin loses access', async () => {
    vi.mocked(verifyGitHubAppSetupAuthState).mockReturnValue({
      type: 'github_app_setup_auth_state',
      projectKey: 'p',
      userId: 'removed-user',
      origin: 'https://app.example',
      installationId: '99',
      nonce: 'n',
      iat: 1,
      exp: 2,
    })
    vi.mocked(getProjectMember).mockResolvedValue(null)

    const res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 'app-state' }, headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('github_app_install_failed')
    expect(exchangeGitHubCode).not.toHaveBeenCalled()
    expect(createGitHubAppInstallationToken).not.toHaveBeenCalled()
  })
})
