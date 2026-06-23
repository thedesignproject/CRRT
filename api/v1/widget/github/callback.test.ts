import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/store.js', () => ({ getRepoConfig: vi.fn() }))
vi.mock('../../../_lib/widget-github-auth.js', () => ({
  assertGitHubRepoAccess: vi.fn(),
  createWidgetAuthToken: vi.fn(() => 'widget-token'),
  exchangeGitHubCode: vi.fn(() => 'gh-token'),
  getGitHubUser: vi.fn(() => ({ id: '42', login: 'octo' })),
  verifyWidgetGithubState: vi.fn(() => ({ projectKey: 'p', origin: 'https://app.example' })),
  widgetCallbackHtml: vi.fn((origin, message) => `html:${origin}:${JSON.stringify(message)}`),
}))

import handler from './callback.js'
import { getRepoConfig } from '../../../_lib/store.js'
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
  })

  it('exchanges the code, checks repo access, and returns a widget token', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    const res = mockRes()
    await call({ method: 'GET', query: { code: 'c', state: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
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
})
