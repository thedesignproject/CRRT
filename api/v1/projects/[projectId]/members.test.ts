import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  getProjectMember: vi.fn(),
  listProjectMembers: vi.fn(),
}))

import handler from './members.js'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, listProjectMembers } from '../../../_lib/store.js'

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
  vi.mocked(listProjectMembers).mockReset()
})

describe('api/v1/projects/[projectId]/members GET', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-GET + unauthenticated + missing projectKey', async () => {
    let res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('requires membership, returns the roster, and 500s on error', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    // non-member
    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    // member → roster
    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    vi.mocked(listProjectMembers).mockResolvedValueOnce([{ userId: 'u', email: 'a@b.c', role: 'admin' }] as never)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ userId: 'u', email: 'a@b.c', role: 'admin' }])

    // error
    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' })
    vi.mocked(listProjectMembers).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
