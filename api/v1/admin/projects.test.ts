import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({
  ADMIN_PROJECT_SORTS: [
    'lastCommentAt', 'createdAt', 'commentCount', 'feedbackShareCount', 'commentedUrlCount',
  ],
  listProjectsWithComments: vi.fn(),
}))

import handler from './projects.js'
import { requireSuperAdmin } from '../../_lib/auth.js'
import { listProjectsWithComments } from '../../_lib/store.js'

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
  vi.mocked(requireSuperAdmin).mockReset()
  vi.mocked(listProjectsWithComments).mockReset()
})

describe('api/v1/admin/projects', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('returns 405 for non-GET', async () => {
    const res = mockRes()
    await call({ method: 'POST', query: {}, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 403 when not a super admin', async () => {
    vi.mocked(requireSuperAdmin).mockImplementation(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' })
      return null
    })
    const res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(403)
    expect(listProjectsWithComments).not.toHaveBeenCalled()
  })

  it('returns the project list, 500 on store throw', async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    const page = { items: [], nextCursor: null, hasMore: false }
    vi.mocked(listProjectsWithComments).mockResolvedValueOnce(page)
    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(page)
    expect(listProjectsWithComments).toHaveBeenCalledWith({
      limit: 50, cursor: undefined, sort: 'lastCommentAt', direction: 'desc',
    })

    vi.mocked(listProjectsWithComments).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  it('validates pagination and sorting parameters', async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    for (const query of [
      { limit: '101' }, { cursor: ['x'] }, { sort: 'nope' }, { sort: ['createdAt'] },
      { direction: 'sideways' },
    ]) {
      const res = mockRes()
      await call({ method: 'GET', query, headers: {} }, res)
      expect(res.statusCode).toBe(400)
    }
  })
})
