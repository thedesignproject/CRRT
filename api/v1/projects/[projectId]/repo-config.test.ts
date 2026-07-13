import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/github-app.js', () => ({
  assertGitHubInstallationRepoAccess: vi.fn(),
  verifyGitHubAppInstallationToken: vi.fn(),
}))
vi.mock('../../../_lib/store.js', () => ({
  connectGithubRepo: vi.fn(),
  disconnectGithubRepo: vi.fn(),
  getProjectMember: vi.fn(),
  getRepoConfig: vi.fn(),
  normalizeGitHubRepoUrl: vi.fn((value: string) => value === 'bad' ? null : ({
    repoUrl: 'https://github.com/acme/widgets',
    githubOwner: 'acme',
    githubRepo: 'widgets',
  })),
}))

import handler from './repo-config.js'
import { requireUser } from '../../../_lib/auth.js'
import {
  assertGitHubInstallationRepoAccess,
  verifyGitHubAppInstallationToken,
} from '../../../_lib/github-app.js'
import {
  connectGithubRepo,
  disconnectGithubRepo,
  getProjectMember,
  getRepoConfig,
} from '../../../_lib/store.js'

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
  vi.mocked(assertGitHubInstallationRepoAccess).mockReset()
  vi.mocked(verifyGitHubAppInstallationToken).mockReset().mockReturnValue({
    projectKey: 'p',
    userId: 'u',
    installationId: '99',
    expectedConnectionVersion: 4,
  } as never)
  vi.mocked(connectGithubRepo).mockReset()
  vi.mocked(disconnectGithubRepo).mockReset()
  vi.mocked(getProjectMember).mockReset()
  vi.mocked(getRepoConfig).mockReset()
})

describe('api/v1/projects/[projectId]/repo-config', () => {
  it('handles OPTIONS, rejects unsupported methods, and requires auth', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' })
      return null
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    res = mockRes()
    await call({
      method: 'PATCH',
      query: { projectId: 'p', token: 'query-token-must-not-work' },
      body: { repoUrl: null },
      headers: {},
    }, res)
    expect(res.statusCode).toBe(401)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: null }, headers: { authorization: 'Basic abc' } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('requires a project id and admin role', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns and connects a verified repo for admins', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    vi.mocked(getRepoConfig).mockResolvedValueOnce({ repoUrl: 'https://github.com/acme/widgets' } as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ repoUrl: 'https://github.com/acme/widgets' })

    vi.mocked(connectGithubRepo).mockResolvedValueOnce({
      repoUrl: 'https://github.com/acme/widgets',
      githubOwner: 'acme',
      githubRepo: 'widgets',
      githubConnectionStatus: 'connected',
    } as never)
    res = mockRes()
    await call({
      method: 'PATCH',
      query: { projectId: 'p' },
      body: { repoUrl: 'acme/widgets', installationToken: 'proof' },
      headers: { authorization: 'Bearer session' },
    }, res)
    expect(res.statusCode).toBe(200)
    expect(assertGitHubInstallationRepoAccess).toHaveBeenCalledWith('99', 'acme', 'widgets')
    expect(connectGithubRepo).toHaveBeenCalledWith('p', 'u', 'https://github.com/acme/widgets', '99', 4)
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.body).not.toHaveProperty('githubInstallationId')
  })

  it('disconnects the complete GitHub connection', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(disconnectGithubRepo).mockResolvedValue({
      repoUrl: null,
      githubConnectionStatus: 'disconnected',
    } as never)

    const res = mockRes()
    await call({
      method: 'PATCH',
      query: { projectId: 'p' },
      body: { repoUrl: null },
      headers: { authorization: 'Bearer session' },
    }, res)

    expect(res.statusCode).toBe(200)
    expect(disconnectGithubRepo).toHaveBeenCalledWith('p', 'u')
    expect(assertGitHubInstallationRepoAccess).not.toHaveBeenCalled()
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('validates repo and installation proof input', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    const headers = { authorization: 'Bearer session' }

    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: {}, headers }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, headers }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 42 }, headers }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'acme/widgets' }, headers }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'bad', installationToken: 'proof' }, headers }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(verifyGitHubAppInstallationToken).mockReturnValueOnce(null)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'acme/widgets', installationToken: 'bad-proof' }, headers }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(verifyGitHubAppInstallationToken).mockReturnValueOnce({ projectKey: 'other', userId: 'u' } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'acme/widgets', installationToken: 'proof' }, headers }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(verifyGitHubAppInstallationToken).mockReturnValueOnce({ projectKey: 'p', userId: 'third-user' } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'acme/widgets', installationToken: 'proof' }, headers }, res)
    expect(res.statusCode).toBe(403)
    expect(assertGitHubInstallationRepoAccess).not.toHaveBeenCalled()
  })

  it('maps safe GitHub, race, and persistence failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    const req = {
      method: 'PATCH', query: { projectId: 'p' },
      body: { repoUrl: 'acme/widgets', installationToken: 'proof' },
      headers: { authorization: 'Bearer session' },
    }

    for (const [message, status] of [
      ['github_installation_repo_inaccessible', 403],
      ['github_installation_token_failed', 502],
      ['github_installation_repo_lookup_failed', 502],
    ] as const) {
      vi.mocked(assertGitHubInstallationRepoAccess).mockRejectedValueOnce(new Error(message))
      const res = mockRes()
      await call(req, res)
      expect(res.statusCode).toBe(status)
      expect(String((res.body as { error: string }).error)).not.toContain('99')
    }

    vi.mocked(connectGithubRepo).mockRejectedValueOnce(new Error('stale_connection_attempt'))
    let res = mockRes()
    await call(req, res)
    expect(res.statusCode).toBe(409)

    vi.mocked(connectGithubRepo).mockRejectedValueOnce(new Error('invalid_github_repo'))
    res = mockRes()
    await call(req, res)
    expect(res.statusCode).toBe(400)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(connectGithubRepo).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call(req, res)
    expect(res.statusCode).toBe(500)
    expect(consoleError).toHaveBeenCalledWith('GitHub repository configuration failed')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('db down')
    consoleError.mockRestore()
  })
})
