import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  getProjectMember: vi.fn(),
  getRepoConfig: vi.fn(),
  updateRepoConfig: vi.fn(),
}))

import handler from './repo-config.js'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, getRepoConfig, updateRepoConfig } from '../../../_lib/store.js'

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
  vi.mocked(getProjectMember).mockReset()
  vi.mocked(getRepoConfig).mockReset()
  vi.mocked(updateRepoConfig).mockReset()
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

  it('returns and updates repo config for admins', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    vi.mocked(getRepoConfig).mockResolvedValueOnce({ repoUrl: 'https://github.com/acme/widgets' } as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ repoUrl: 'https://github.com/acme/widgets' })

    vi.mocked(updateRepoConfig).mockResolvedValueOnce({ githubOwner: 'acme', githubRepo: 'widgets' } as never)
    res = mockRes()
    await call({
      method: 'PATCH',
      query: { projectId: 'p' },
      body: { repoUrl: 'acme/widgets' },
      headers: {},
    }, res)
    expect(res.statusCode).toBe(200)
    expect(updateRepoConfig).toHaveBeenCalledWith('p', { repoUrl: 'acme/widgets' })
  })

  it('validates repoUrl and maps expected failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 42 }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(updateRepoConfig).mockRejectedValueOnce(new Error('invalid_github_repo'))
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: 'bad' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(updateRepoConfig).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { repoUrl: null }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
