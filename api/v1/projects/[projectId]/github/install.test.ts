import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/github-app.js', () => ({
  buildGitHubAppInstallUrl: vi.fn((state: string) => `https://github.com/apps/crrt/installations/new?state=${state}`),
  createGitHubAppInstallState: vi.fn(() => 'install-state'),
  createGitHubAppReuseAuthState: vi.fn(({ installationRef }) => `reuse-${installationRef}`),
}))
vi.mock('../../../../_lib/store.js', () => ({
  getProjectMember: vi.fn(),
  listGitHubUserInstallations: vi.fn(() => []),
}))
vi.mock('../../../../_lib/widget-github-auth.js', () => ({
  buildGitHubAuthorizeUrl: vi.fn((state: string) => `https://github.com/login/oauth/authorize?state=${state}`),
}))

import handler from './install.js'
import { requireUser } from '../../../../_lib/auth.js'
import { buildGitHubAppInstallUrl, createGitHubAppInstallState, createGitHubAppReuseAuthState } from '../../../../_lib/github-app.js'
import { getProjectMember, listGitHubUserInstallations } from '../../../../_lib/store.js'
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
  vi.mocked(requireUser).mockReset()
  vi.mocked(buildGitHubAppInstallUrl).mockClear()
  vi.mocked(createGitHubAppInstallState).mockClear()
  vi.mocked(createGitHubAppReuseAuthState).mockClear()
  vi.mocked(getProjectMember).mockReset()
  vi.mocked(listGitHubUserInstallations).mockReset().mockResolvedValue([])
  vi.mocked(buildGitHubAuthorizeUrl).mockClear()
})

describe('api/v1/projects/[projectId]/github/install', () => {
  it('validates method, auth, project, and admin role', async () => {
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
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns the install URL and maps unexpected errors', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: { origin: 'https://app.example/path' } }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallState).toHaveBeenCalledWith({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
    })
    expect(buildGitHubAppInstallUrl).toHaveBeenCalledWith('install-state')
    expect(res.body).toEqual({
      installUrl: 'https://github.com/apps/crrt/installations/new?state=install-state',
      installations: [],
    })
    expect(res.headers['Cache-Control']).toBe('no-store')

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: { origin: '%' } }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallState).toHaveBeenLastCalledWith({
      projectKey: 'p',
      userId: 'u',
      origin: 'http://localhost:3000',
    })

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallState).toHaveBeenLastCalledWith({
      projectKey: 'p',
      userId: 'u',
      origin: 'http://localhost:3000',
    })

    vi.mocked(getProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  it('returns user-scoped existing installations with fresh project-bound OAuth URLs', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(listGitHubUserInstallations).mockResolvedValue([{
      id: 'opaque-ref',
      githubAccountLogin: 'acme',
      githubAccountType: 'Organization',
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    }])

    const res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: { origin: 'https://app.example' } }, res)

    expect(createGitHubAppReuseAuthState).toHaveBeenCalledWith({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationRef: 'opaque-ref',
    })
    expect(buildGitHubAuthorizeUrl).toHaveBeenCalledWith('reuse-opaque-ref')
    expect(res.body).toMatchObject({
      installations: [{
        id: 'opaque-ref',
        githubAccountLogin: 'acme',
        authorizeUrl: 'https://github.com/login/oauth/authorize?state=reuse-opaque-ref',
      }],
    })
    expect(JSON.stringify(res.body)).not.toContain('installationId')
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})
