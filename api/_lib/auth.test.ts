import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getSupabase: vi.fn() }))

import { getSupabase } from './supabase.js'
import { requireReviewer, requireUser } from './auth.js'

interface MockRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  status(code: number): MockRes
  json(data: unknown): MockRes
  end(): MockRes
  setHeader(key: string, value: string): void
}

function mockReq(headers: Record<string, string> = {}) {
  return { method: 'GET', query: {}, body: {}, headers } as never
}

function mockRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
    end() {
      return this
    },
    setHeader(key, value) {
      this.headers[key] = value
    },
  }
}

beforeEach(() => {
  vi.mocked(getSupabase).mockReset()
  delete process.env.REVIEWER_API_TOKEN
})

describe('requireReviewer', () => {
  it('returns 500 when REVIEWER_API_TOKEN is not configured', () => {
    const res = mockRes()
    const ok = requireReviewer(mockReq(), res as never)
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(500)
  })

  it('returns 401 when no token is presented', () => {
    process.env.REVIEWER_API_TOKEN = 'expected'
    const res = mockRes()
    const ok = requireReviewer(mockReq(), res as never)
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token does not match', () => {
    process.env.REVIEWER_API_TOKEN = 'expected'
    const res = mockRes()
    const ok = requireReviewer(mockReq({ authorization: 'Bearer wrong' }), res as never)
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns true when token matches', () => {
    process.env.REVIEWER_API_TOKEN = 'expected'
    const res = mockRes()
    const ok = requireReviewer(mockReq({ authorization: 'Bearer expected' }), res as never)
    expect(ok).toBe(true)
  })
})

describe('requireUser', () => {
  it('returns 401 when no Bearer token is present', async () => {
    const res = mockRes()
    const user = await requireUser(mockReq(), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when Supabase rejects the token', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'bad' } }) },
    } as never)

    const res = mockRes()
    const user = await requireUser(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when Supabase returns a user without email', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u', email: null } }, error: null }) },
    } as never)

    const res = mockRes()
    const user = await requireUser(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when Supabase throws', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error('network')) },
    } as never)

    const res = mockRes()
    const user = await requireUser(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('returns the authenticated user when token is valid', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u-1', email: 'a@example.com' } },
          error: null,
        }),
      },
    } as never)

    const res = mockRes()
    const user = await requireUser(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toEqual({ userId: 'u-1', email: 'a@example.com' })
  })
})
