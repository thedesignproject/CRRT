import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  createFeedbackEvent: vi.fn(),
  findActiveSharesForComment: vi.fn(),
  updateImplementationStatus: vi.fn(),
}))

import handler from './implementation-status.js'
import { requireUser } from '../../../_lib/auth.js'

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
})

describe('api/v1/comments/[commentId]/implementation-status', () => {
  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })

    const res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('proceeds past the guard when requireUser returns a user', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    const res = mockRes()
    await call({ method: 'PATCH', query: {}, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })
})
