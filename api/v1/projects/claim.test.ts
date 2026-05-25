import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ claimProject: vi.fn() }))

import handler from './claim.js'
import { requireUser } from '../../_lib/auth.js'
import { claimProject } from '../../_lib/store.js'

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
  vi.mocked(claimProject).mockReset()
})

describe('api/v1/projects/claim', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('tolerates absent body / non-Error throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    // no body → req.body ?? {} fallback → 400 Missing projectKey
    let res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // claimProject throws something that isn't an Error → falls back to 500
    vi.mocked(claimProject).mockImplementationOnce(() => { throw 'string-not-error' })
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })

  it('rejects non-POST + unauthenticated', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' })
      return null
    })
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('happy path + missing projectKey / not_found / already_claimed / other error', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'POST', body: {}, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(claimProject).mockResolvedValueOnce({ publicKey: 'k' } as never)
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(claimProject).toHaveBeenCalledWith('u', 'k')

    vi.mocked(claimProject).mockRejectedValueOnce(new Error('not_found'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(claimProject).mockRejectedValueOnce(new Error('already_claimed'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(409)

    vi.mocked(claimProject).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'k' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
