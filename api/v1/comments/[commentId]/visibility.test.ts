import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireProjectCommentCapability: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  getComment: vi.fn(),
  removeGuestCommentActivityNotifications: vi.fn(),
  updateCommentVisibility: vi.fn(),
}))

import handler from './visibility.js'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { getComment, removeGuestCommentActivityNotifications, updateCommentVisibility } from '../../../_lib/store.js'

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}

const call = (req: unknown, res: unknown) =>
  (handler as unknown as (request: unknown, response: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'u@example.com' })
  vi.mocked(requireProjectCommentCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(getComment).mockReset().mockResolvedValue({ id: 'c', projectId: 'p', visibility: 'shared' } as never)
  vi.mocked(updateCommentVisibility).mockReset().mockResolvedValue({ id: 'c', projectId: 'p', visibility: 'internal' } as never)
  vi.mocked(removeGuestCommentActivityNotifications).mockReset().mockResolvedValue(undefined)
})

describe('comment visibility endpoint', () => {
  it('handles preflight, methods, authentication, and missing ids', async () => {
    let res = response()
    await call({ method: 'OPTIONS', headers: {} }, res)
    expect(res.statusCode).toBe(204)
    res = response()
    await call({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValueOnce(null)
    res = response()
    await call({ method: 'PATCH', headers: {} }, res)
    expect(getComment).not.toHaveBeenCalled()
    res = response()
    await call({ method: 'PATCH', query: {}, body: { visibility: 'shared' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('lets internal members change the audience', async () => {
    const res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'internal' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(requireProjectCommentCapability).toHaveBeenCalledWith(
      expect.anything(), res, expect.anything(), expect.objectContaining({ projectId: 'p' }), 'feedback:manage',
    )
    expect(removeGuestCommentActivityNotifications).toHaveBeenCalledWith('p', 'c')
    expect(updateCommentVisibility).toHaveBeenCalledWith('p', 'c', 'internal')
    expect(vi.mocked(updateCommentVisibility).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(removeGuestCommentActivityNotifications).mock.invocationCallOrder[0])
  })

  it('rejects guests and invalid or missing records without writing', async () => {
    vi.mocked(requireProjectCommentCapability).mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' }); return null
    })
    let res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'internal' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
    expect(updateCommentVisibility).not.toHaveBeenCalled()

    res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'private' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getComment).mockResolvedValueOnce(null)
    res = response()
    await call({ method: 'PATCH', query: { commentId: 'missing' }, body: { visibility: 'shared' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns missing and internal failures without premature cleanup', async () => {
    vi.mocked(updateCommentVisibility).mockResolvedValueOnce(null)
    let res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'internal' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)
    expect(removeGuestCommentActivityNotifications).not.toHaveBeenCalled()

    vi.mocked(updateCommentVisibility).mockResolvedValueOnce({ id: 'c', projectId: 'p', visibility: 'shared' } as never)
    res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'shared' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(removeGuestCommentActivityNotifications).not.toHaveBeenCalled()

    vi.mocked(getComment).mockRejectedValueOnce(new Error('database down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    res = response()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { visibility: 'shared' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
  })
})
