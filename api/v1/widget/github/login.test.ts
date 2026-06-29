import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/store.js', () => ({ getRepoConfig: vi.fn() }))
vi.mock('../../../_lib/widget-github-auth.js', () => ({
  buildGitHubAuthorizeUrl: vi.fn(() => 'https://github.com/login/oauth/authorize?state=s'),
  createWidgetGithubState: vi.fn(() => 'state-token'),
}))

import handler from './login.js'
import { getRepoConfig } from '../../../_lib/store.js'
import { buildGitHubAuthorizeUrl, createWidgetGithubState } from '../../../_lib/widget-github-auth.js'

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
  vi.mocked(getRepoConfig).mockReset()
  vi.mocked(buildGitHubAuthorizeUrl).mockClear()
  vi.mocked(createWidgetGithubState).mockClear()
})

describe('api/v1/widget/github/login', () => {
  it('handles options, method, and query validation', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    res = mockRes()
    await call({ method: 'GET', query: { origin: 'https://app.example/path' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'p', origin: '%' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('requires a configured GitHub repo and redirects to GitHub', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: null, githubRepo: null } as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'p', origin: 'https://app.example/path' }, headers: {} }, res)
    expect(res.statusCode).toBe(409)

    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'p', origin: 'https://app.example/path' }, headers: {} }, res)
    expect(res.statusCode).toBe(302)
    expect(createWidgetGithubState).toHaveBeenCalledWith({ projectKey: 'p', origin: 'https://app.example' })
    expect(buildGitHubAuthorizeUrl).toHaveBeenCalledWith('state-token')
    expect(res.headers.Location).toBe('https://github.com/login/oauth/authorize?state=s')
  })

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(getRepoConfig).mockRejectedValueOnce(new Error('db down'))
    const res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'p', origin: 'https://app.example' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
