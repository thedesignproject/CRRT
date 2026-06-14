import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  getProjectMember: vi.fn(),
  updateProject: vi.fn(),
}))

import handler from './index.js'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, updateProject } from '../../../_lib/store.js'

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
  vi.mocked(updateProject).mockReset()
})

describe('api/v1/projects/[projectId] PATCH (rename)', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-PATCH + unauthenticated', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'x' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates projectKey + name', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    // missing projectKey
    let res = mockRes()
    await call({ method: 'PATCH', query: {}, body: { name: 'x' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // missing/blank name (also covers non-string body.name + absent body)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: '   ' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // too long
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'a'.repeat(81) }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('enforces admin role', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'New' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'New' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('renames, 404s a missing project, and 500s on error', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    // success
    vi.mocked(updateProject).mockResolvedValueOnce({ publicKey: 'p', name: 'New' } as never)
    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: '  New  ' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(updateProject).toHaveBeenCalledWith('p', { name: 'New' })
    expect(res.body).toMatchObject({ name: 'New' })

    // not found
    vi.mocked(updateProject).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'New' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // error
    vi.mocked(updateProject).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { name: 'New' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  describe('allowedOrigins', () => {
    beforeEach(() => {
      vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
      vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    })

    it('normalizes and dedupes domains before saving, without requiring a name', async () => {
      vi.mocked(updateProject).mockResolvedValueOnce({ publicKey: 'p', allowedOrigins: ['example.com', 'app.foo.io'] } as never)
      const res = mockRes()
      await call({
        method: 'PATCH',
        query: { projectId: 'p' },
        body: { allowedOrigins: ['Example.com/', 'https://app.foo.io/path', 'example.com'] },
        headers: {},
      }, res)
      expect(res.statusCode).toBe(200)
      expect(updateProject).toHaveBeenCalledWith('p', { allowedOrigins: ['example.com', 'app.foo.io'] })
    })

    it('accepts an empty array to disable the allowlist', async () => {
      vi.mocked(updateProject).mockResolvedValueOnce({ publicKey: 'p', allowedOrigins: [] } as never)
      const res = mockRes()
      await call({ method: 'PATCH', query: { projectId: 'p' }, body: { allowedOrigins: [] }, headers: {} }, res)
      expect(res.statusCode).toBe(200)
      expect(updateProject).toHaveBeenCalledWith('p', { allowedOrigins: [] })
    })

    it('updates name and allowlist together', async () => {
      vi.mocked(updateProject).mockResolvedValueOnce({ publicKey: 'p', name: 'New', allowedOrigins: ['example.com'] } as never)
      const res = mockRes()
      await call({
        method: 'PATCH',
        query: { projectId: 'p' },
        body: { name: 'New', allowedOrigins: ['example.com'] },
        headers: {},
      }, res)
      expect(res.statusCode).toBe(200)
      expect(updateProject).toHaveBeenCalledWith('p', { name: 'New', allowedOrigins: ['example.com'] })
    })

    it('still validates the name when sent alongside allowedOrigins', async () => {
      const res = mockRes()
      await call({
        method: 'PATCH',
        query: { projectId: 'p' },
        body: { name: '   ', allowedOrigins: ['example.com'] },
        headers: {},
      }, res)
      expect(res.statusCode).toBe(400)
      expect(updateProject).not.toHaveBeenCalled()
    })

    it('rejects malformed allowlists', async () => {
      // not an array
      let res = mockRes()
      await call({ method: 'PATCH', query: { projectId: 'p' }, body: { allowedOrigins: 'example.com' }, headers: {} }, res)
      expect(res.statusCode).toBe(400)

      // over the entry limit
      res = mockRes()
      await call({ method: 'PATCH', query: { projectId: 'p' }, body: { allowedOrigins: Array(51).fill('example.com') }, headers: {} }, res)
      expect(res.statusCode).toBe(400)

      // non-string entry
      res = mockRes()
      await call({ method: 'PATCH', query: { projectId: 'p' }, body: { allowedOrigins: [42] }, headers: {} }, res)
      expect(res.statusCode).toBe(400)

      // unparseable domain
      res = mockRes()
      await call({ method: 'PATCH', query: { projectId: 'p' }, body: { allowedOrigins: ['not a domain'] }, headers: {} }, res)
      expect(res.statusCode).toBe(400)

      expect(updateProject).not.toHaveBeenCalled()
    })
  })
})
