import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listInvitesForEmail: vi.fn() }))

import handler from './index.js'
import { requireUser } from '../../_lib/auth.js'
import { listInvitesForEmail } from '../../_lib/store.js'

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
  vi.mocked(listInvitesForEmail).mockReset()
})

describe('api/v1/invites', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('returns 500 on non-Error throws', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(listInvitesForEmail).mockImplementationOnce(() => { throw 'string-not-error' })
    const res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })

  it('non-GET 405; unauthed 401; happy path lists invites; 500 on throw', async () => {
    let res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(listInvitesForEmail).mockResolvedValueOnce([{ projectKey: 'p' }] as never)
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(listInvitesForEmail).toHaveBeenCalledWith('a@b.c')

    vi.mocked(listInvitesForEmail).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
