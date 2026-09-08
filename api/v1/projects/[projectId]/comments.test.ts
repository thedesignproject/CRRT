import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
  requireProjectCapability: vi.fn(),
}))
vi.mock('../../../_lib/store.js', () => ({ listProjectComments: vi.fn() }))

import handler from './comments.js'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import { listProjectComments } from '../../../_lib/store.js'

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
  vi.mocked(requireProjectCapability).mockReset()
  vi.mocked(listProjectComments).mockReset()
})

describe('api/v1/projects/[projectId]/comments', () => {
  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates projectId + membership + invalid filters', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(requireProjectCapability).mockImplementationOnce(async (_q, r) => {
      r.status(403).json({ error: 'Forbidden' })
      return null
    })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(requireProjectCapability).mockResolvedValue({ role: 'member' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', reviewStatus: 'nope' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', implementationStatus: 'nope' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('lists comments for members; returns 500 on store throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(requireProjectCapability).mockResolvedValue({ role: 'member' })
    vi.mocked(listProjectComments).mockResolvedValueOnce([{ id: 'c1' }] as never)

    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ id: 'c1' }])
    expect(listProjectComments).toHaveBeenLastCalledWith('p', expect.objectContaining({
      visibility: undefined, includeExternalWork: true,
    }))

    vi.mocked(requireProjectCapability).mockResolvedValueOnce({ role: 'guest' })
    vi.mocked(listProjectComments).mockResolvedValueOnce([{ id: 'shared' }] as never)
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(listProjectComments).toHaveBeenLastCalledWith('p', expect.objectContaining({
      visibility: 'shared', includeExternalWork: false,
    }))

    vi.mocked(listProjectComments).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
