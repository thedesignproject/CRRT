import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/github-app.js', () => ({
  buildGitHubAppInstallUrl: vi.fn((state: string) => `https://github.com/apps/crrt/installations/new?state=${state}`),
  createGitHubAppInstallState: vi.fn(() => 'install-state'),
}))
vi.mock('../../../../_lib/store.js', () => ({ getProjectMember: vi.fn() }))

import handler from './install.js'
import { requireUser } from '../../../../_lib/auth.js'
import { buildGitHubAppInstallUrl, createGitHubAppInstallState } from '../../../../_lib/github-app.js'
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
  vi.mocked(buildGitHubAppInstallUrl).mockClear()
  vi.mocked(createGitHubAppInstallState).mockClear()
  vi.mocked(getProjectMember).mockReset()
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
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createGitHubAppInstallState).toHaveBeenCalledWith({ projectKey: 'p', userId: 'u' })
    expect(buildGitHubAppInstallUrl).toHaveBeenCalledWith('install-state')
    expect(res.body).toEqual({
      installUrl: 'https://github.com/apps/crrt/installations/new?state=install-state',
      installState: 'install-state',
    })

    vi.mocked(getProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
