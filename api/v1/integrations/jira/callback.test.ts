import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/jira.js', () => ({ exchangeJiraCode: vi.fn(), getJiraDestinations: vi.fn(), verifyJiraOAuthState: vi.fn() }))
vi.mock('../../../_lib/tokens.js', () => ({ encryptToken: vi.fn((value: string) => `encrypted:${value}`) }))
vi.mock('../../../_lib/store.js', () => ({ getProjectMember: vi.fn(), upsertProjectIntegration: vi.fn() }))
vi.mock('../../../_lib/widget-github-auth.js', () => ({ widgetCallbackHtml: vi.fn((_origin: string, message: unknown) => JSON.stringify(message)) }))

import handler from './callback.js'
import { exchangeJiraCode, getJiraDestinations, verifyJiraOAuthState } from '../../../_lib/jira.js'
import { getProjectMember, upsertProjectIntegration } from '../../../_lib/store.js'

function response() {
  return {
    statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    send(body: unknown) { this.body = body; return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) => (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)
const state = { projectKey: 'p', userId: 'u', origin: 'https://app.crrt.test', redirectUri: 'https://api.crrt.test/callback' }
const destination = {
  id: 'cloud:100', cloudId: 'cloud', siteName: 'Acme Jira', siteUrl: 'https://acme.atlassian.net',
  projectId: '100', projectKey: 'WEB', projectName: 'Website',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyJiraOAuthState).mockReturnValue(state as never)
  vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' } as never)
  vi.mocked(exchangeJiraCode).mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 'later' })
  vi.mocked(getJiraDestinations).mockResolvedValue([destination])
})

describe('Jira OAuth callback', () => {
  it('validates the method, required query, and signed state', async () => {
    let res = response()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)
    res = response()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
    vi.mocked(verifyJiraOAuthState).mockReturnValueOnce(null)
    res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('stores encrypted tokens and the initial Jira project in a hardened callback page', async () => {
    const res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(upsertProjectIntegration).toHaveBeenCalledWith(expect.objectContaining({
      projectKey: 'p', provider: 'jira', accessTokenCiphertext: 'encrypted:access',
      refreshTokenCiphertext: 'encrypted:refresh', workspaceId: 'cloud', containerId: '100',
      containerName: 'WEB · Website',
    }))
    expect(res.headers['Content-Security-Policy']).toContain("default-src 'none'")
    expect(res.body).toContain('"ok":true')
  })

  it('supports non-rotating refresh tokens', async () => {
    vi.mocked(exchangeJiraCode).mockResolvedValueOnce({ accessToken: 'access', refreshToken: null, expiresAt: null })
    const res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(upsertProjectIntegration).toHaveBeenCalledWith(expect.objectContaining({ refreshTokenCiphertext: null }))
  })

  it('returns a safe callback failure for unauthorized, unavailable, or failed exchanges', async () => {
    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(res.body).toContain('"ok":false')
    vi.mocked(getJiraDestinations).mockResolvedValueOnce([])
    res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(res.body).toContain('jira_oauth_failed')
    vi.mocked(exchangeJiraCode).mockRejectedValueOnce(new Error('secret response'))
    res = response()
    await call({ method: 'GET', query: { code: 'code', state: 'state' }, headers: {} }, res)
    expect(res.body).toContain('jira_oauth_failed')
  })
})
