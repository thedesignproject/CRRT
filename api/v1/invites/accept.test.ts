import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({
  acceptInvite: vi.fn(),
  createNotification: vi.fn(),
}))

import handler from './accept.js'
import { requireUser } from '../../_lib/auth.js'
import { acceptInvite, createNotification } from '../../_lib/store.js'

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
  vi.mocked(acceptInvite).mockReset()
  vi.mocked(createNotification).mockReset()
})

describe('api/v1/invites/accept', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('tolerates absent body (req.body ?? {} fallback)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    const res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('non-POST + unauthed', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates body + not_found + happy path + 500', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'POST', body: {}, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(acceptInvite).mockRejectedValueOnce(new Error('not_found'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(acceptInvite).mockResolvedValueOnce('inviter-1')
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'inviter-1', kind: 'invite.accepted',
    }))

    // notif emit fails → accept still returns 200 (fanout is fire-and-forget)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(acceptInvite).mockResolvedValueOnce('inviter-1')
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('notif down'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()

    vi.mocked(acceptInvite).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)

    // non-Error throw → 500
    vi.mocked(acceptInvite).mockImplementationOnce(() => { throw 'string-not-error' })
    res = mockRes()
    await call({ method: 'POST', body: { projectKey: 'p' }, query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })
})
