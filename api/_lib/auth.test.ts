import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getSupabase: vi.fn(), getServiceSupabase: vi.fn() }))
vi.mock('./store.js', () => ({ getProjectMember: vi.fn() }))

import { getServiceSupabase, getSupabase } from './supabase.js'
import { getProjectMember } from './store.js'
import { isSuperAdmin, requireProjectCapability, requireProjectCommentCapability, requireProjectMembership, requireReviewer, requireSuperAdmin, requireUser } from './auth.js'

// Stub getServiceSupabase().from('super_admins').select(...).eq(...).maybeSingle()
function mockSuperAdminLookup(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  vi.mocked(getServiceSupabase).mockReturnValue({ from } as never)
  return { from, select, eq, maybeSingle }
}

function mockValidUser(id = 'u-1', email = 'a@example.com') {
  vi.mocked(getSupabase).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id, email } }, error: null }) },
  } as never)
}

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
  vi.mocked(getServiceSupabase).mockReset()
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

describe('isSuperAdmin', () => {
  it('returns true when a row exists', async () => {
    mockSuperAdminLookup({ data: { user_id: 'u-1' }, error: null })
    expect(await isSuperAdmin('u-1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    mockSuperAdminLookup({ data: null, error: null })
    expect(await isSuperAdmin('u-1')).toBe(false)
  })

  it('throws when the lookup errors', async () => {
    mockSuperAdminLookup({ data: null, error: { message: 'db down' } })
    await expect(isSuperAdmin('u-1')).rejects.toThrow('db down')
  })
})

describe('requireSuperAdmin', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    const res = mockRes()
    const user = await requireSuperAdmin(mockReq(), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('returns the user when they are a super admin', async () => {
    mockValidUser()
    mockSuperAdminLookup({ data: { user_id: 'u-1' }, error: null })
    const res = mockRes()
    const user = await requireSuperAdmin(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toEqual({ userId: 'u-1', email: 'a@example.com' })
  })

  it('writes 403 when the caller is not a super admin', async () => {
    mockValidUser()
    mockSuperAdminLookup({ data: null, error: null })
    const res = mockRes()
    const user = await requireSuperAdmin(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(403)
  })

  it('writes 500 when the super-admin check throws', async () => {
    mockValidUser()
    mockSuperAdminLookup({ data: null, error: { message: 'db down' } })
    const res = mockRes()
    const user = await requireSuperAdmin(mockReq({ authorization: 'Bearer tok' }), res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(500)
  })
})

describe('requireProjectMembership', () => {
  const USER = { userId: 'u-1', email: 'a@b.c' }

  it('returns true when the user is a member', async () => {
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'member', isOwner: false })
    const res = mockRes()
    const ok = await requireProjectMembership(mockReq(), res as never, USER, 'p')
    expect(ok).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it('writes 403 when the user is not a member', async () => {
    vi.mocked(getProjectMember).mockResolvedValue(null)
    const res = mockRes()
    const ok = await requireProjectMembership(mockReq(), res as never, USER, 'p')
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  it('writes 500 when the membership check throws', async () => {
    vi.mocked(getProjectMember).mockRejectedValue(new Error('db down'))
    const res = mockRes()
    const ok = await requireProjectMembership(mockReq(), res as never, USER, 'p')
    expect(ok).toBe(false)
    expect(res.statusCode).toBe(500)
  })

  it('allows guests to contribute but denies internal capabilities', async () => {
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'guest', isOwner: false })
    expect(await requireProjectCapability(mockReq(), mockRes() as never, USER, 'p', 'feedback:create')).toEqual({ role: 'guest' })
    const res = mockRes()
    expect(await requireProjectCapability(mockReq(), res as never, USER, 'p', 'agent:operate')).toBeNull()
    expect(res.statusCode).toBe(403)
  })

  it('conceals internal comment existence from guests', async () => {
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'guest', isOwner: false })
    const res = mockRes()
    expect(await requireProjectCommentCapability(
      mockReq(), res as never, USER, { projectId: 'p', visibility: 'internal' }, 'feedback:manage',
    )).toBeNull()
    expect(res.statusCode).toBe(404)

    vi.mocked(getProjectMember).mockResolvedValue({ role: 'member', isOwner: false })
    expect(await requireProjectCommentCapability(
      mockReq(), mockRes() as never, USER, { projectId: 'p', visibility: 'internal' }, 'feedback:manage',
    )).toEqual({ role: 'member' })
  })

  it('fails closed when comment membership is missing, insufficient, or unavailable', async () => {
    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    expect(await requireProjectCommentCapability(
      mockReq(), res as never, USER, { projectId: 'p', visibility: 'shared' }, 'feedback:create',
    )).toBeNull()
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'guest', isOwner: false })
    res = mockRes()
    expect(await requireProjectCommentCapability(
      mockReq(), res as never, USER, { projectId: 'p', visibility: 'shared' }, 'feedback:manage',
    )).toBeNull()
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    expect(await requireProjectCommentCapability(
      mockReq(), res as never, USER, { projectId: 'p', visibility: 'shared' }, 'feedback:create',
    )).toBeNull()
    expect(res.statusCode).toBe(500)
  })
})
