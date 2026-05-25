import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listNotificationsForUser: vi.fn() }))

import handler from './index.js'
import { requireUser } from '../../_lib/auth.js'
import { listNotificationsForUser } from '../../_lib/store.js'

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
  vi.mocked(listNotificationsForUser).mockReset()
})

describe('api/v1/notifications', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('falls back to "Unexpected error" on non-Error throws', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-1', email: 'a@b.c' })
    vi.mocked(listNotificationsForUser).mockImplementationOnce(() => { throw 'string-not-error' })
    const res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Unexpected error' })
  })

  it('non-GET 405; unauthed 401; happy path + unreadOnly flag; 500 on throw', async () => {
    let res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-1', email: 'a@b.c' })
    vi.mocked(listNotificationsForUser).mockResolvedValueOnce([{ id: 'n1' }] as never)
    res = mockRes()
    await call({ method: 'GET', query: { unreadOnly: 'true' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(listNotificationsForUser).toHaveBeenCalledWith('u-1', { unreadOnly: true })

    vi.mocked(listNotificationsForUser).mockResolvedValueOnce([] as never)
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(listNotificationsForUser).toHaveBeenLastCalledWith('u-1', { unreadOnly: false })

    vi.mocked(listNotificationsForUser).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
