import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/store.js', () => ({ getRepoConfig: vi.fn() }))
vi.mock('../../_lib/widget-github-auth.js', () => ({ verifyWidgetAuthToken: vi.fn() }))

import handler from './eligibility.js'
import { getRepoConfig } from '../../_lib/store.js'
import { verifyWidgetAuthToken } from '../../_lib/widget-github-auth.js'

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
  vi.mocked(verifyWidgetAuthToken).mockReset()
})

describe('api/v1/agent/eligibility', () => {
  it('handles options, method validation, and missing project id', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('reports repo_not_configured without requiring login', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: null, githubRepo: null } as never)
    const res = mockRes()
    await call({ method: 'GET', query: { project_id: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      canRequest: false,
      mustLogin: false,
      reason: 'repo_not_configured',
    })
  })

  it('returns a login URL when the widget token is missing or invalid', async () => {
    vi.mocked(getRepoConfig).mockResolvedValue({ githubOwner: 'acme', githubRepo: 'widgets' } as never)

    let res = mockRes()
    await call({
      method: 'GET',
      query: { project_id: 'p' },
      headers: { origin: 'https://app.example' },
    }, res)
    expect(res.body).toMatchObject({ canRequest: false, mustLogin: true, reason: 'login_required' })
    expect((res.body as { loginUrl: string }).loginUrl).toContain('/api/v1/widget/github/login')
    expect((res.body as { loginUrl: string }).loginUrl).toContain('projectKey=p')

    vi.mocked(verifyWidgetAuthToken).mockReturnValueOnce(null)
    res = mockRes()
    await call({
      method: 'GET',
      query: { project_id: 'p' },
      headers: { authorization: 'Bearer bad', host: 'crrt.test', 'x-forwarded-proto': 'https' },
    }, res)
    expect(res.body).toMatchObject({ canRequest: false, reason: 'invalid_token' })
  })

  it('rejects tokens for another project or stale repo config', async () => {
    vi.mocked(getRepoConfig).mockResolvedValue({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    vi.mocked(verifyWidgetAuthToken).mockReturnValueOnce({
      projectKey: 'other',
      githubUserId: '1',
      githubLogin: 'octo',
      githubOwner: 'acme',
      githubRepo: 'widgets',
      iat: 1,
      exp: 2,
    })
    let res = mockRes()
    await call({ method: 'GET', query: { project_id: 'p' }, headers: { authorization: 'Bearer tok' } }, res)
    expect(res.body).toMatchObject({ canRequest: false, reason: 'invalid_token' })

    vi.mocked(verifyWidgetAuthToken).mockReturnValueOnce({
      projectKey: 'p',
      githubUserId: '1',
      githubLogin: 'octo',
      githubOwner: 'acme',
      githubRepo: 'old',
      iat: 1,
      exp: 2,
    })
    res = mockRes()
    await call({ method: 'GET', query: { project_id: 'p' }, headers: { authorization: 'Bearer tok' } }, res)
    expect(res.body).toMatchObject({ canRequest: false, reason: 'invalid_token' })
  })

  it('allows matching widget auth tokens and 500s on store errors', async () => {
    vi.mocked(getRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    vi.mocked(verifyWidgetAuthToken).mockReturnValueOnce({
      projectKey: 'p',
      githubUserId: '1',
      githubLogin: 'octo',
      githubOwner: 'acme',
      githubRepo: 'widgets',
      iat: 1,
      exp: 2,
    })
    let res = mockRes()
    await call({ method: 'GET', query: { project_id: 'p' }, headers: { authorization: 'Bearer tok' } }, res)
    expect(res.body).toMatchObject({
      canRequest: true,
      mustLogin: false,
      githubLogin: 'octo',
    })

    vi.mocked(getRepoConfig).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'GET', query: { project_id: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
