import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ markNotificationRead: vi.fn() }))

import handler from './read.js'
import { requireUser } from '../../../_lib/auth.js'
import { markNotificationRead } from '../../../_lib/store.js'

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
  vi.mocked(markNotificationRead).mockReset()
})

describe('api/v1/notifications/[notificationId]/read', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('returns 500 on non-Error throws', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(markNotificationRead).mockImplementationOnce(() => { throw 'string-not-error' })
    const res = mockRes()
    await call({ method: 'POST', query: { notificationId: 'n' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })

  it('non-POST 405; unauthed 401; missing id; happy / not_found / 500', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'POST', query: { notificationId: 'n' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(markNotificationRead).mockResolvedValueOnce(true)
    res = mockRes()
    await call({ method: 'POST', query: { notificationId: 'n' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(markNotificationRead).toHaveBeenCalledWith('n', 'u')

    vi.mocked(markNotificationRead).mockResolvedValueOnce(false)
    res = mockRes()
    await call({ method: 'POST', query: { notificationId: 'n' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(markNotificationRead).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'POST', query: { notificationId: 'n' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
