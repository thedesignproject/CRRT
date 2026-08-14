import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/store.js', () => ({
  getProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
}))

import handler from './[userId].js'
import { requireUser } from '../../../../_lib/auth.js'
import { getProjectMember, removeProjectMember } from '../../../../_lib/store.js'

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
  vi.mocked(removeProjectMember).mockReset()
})

describe('api/v1/projects/[projectId]/members/[userId] DELETE', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-DELETE + unauthenticated', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates projectKey + userId', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'DELETE', query: { userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('enforces admin role', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('removes a member, 404s a missing one, 409s the last admin, 500s on error', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    // success
    vi.mocked(removeProjectMember).mockResolvedValueOnce(true)
    let res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(removeProjectMember).toHaveBeenCalledWith('p', 'm')
    expect(res.body).toMatchObject({ projectKey: 'p', userId: 'm' })

    // not found
    vi.mocked(removeProjectMember).mockResolvedValueOnce(false)
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // last admin
    vi.mocked(removeProjectMember).mockRejectedValueOnce(new Error('last_admin'))
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(409)

    // generic error
    vi.mocked(removeProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)

    // non-Error throw → 500 (msg stays undefined)
    vi.mocked(removeProjectMember).mockImplementationOnce(() => { throw 'string-not-error' })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'm' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
