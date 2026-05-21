import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
}))

vi.mock('../../_lib/store.js', () => ({
  deleteInvite: vi.fn(),
  findInvitesForEmail: vi.fn(),
  insertProjectMembership: vi.fn(),
}))

import handler from './bootstrap.js'
import { requireUser } from '../../_lib/auth.js'
import { deleteInvite, findInvitesForEmail, insertProjectMembership } from '../../_lib/store.js'

interface MockRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  status(code: number): MockRes
  json(data: unknown): MockRes
  end(): MockRes
  setHeader(key: string, value: string): void
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { method: 'POST', query: {}, body: {}, headers: {}, ...overrides }
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

const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

const USER = { userId: 'user-1', email: 'a@example.com' }

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(findInvitesForEmail).mockReset()
  vi.mocked(insertProjectMembership).mockReset()
  vi.mocked(deleteInvite).mockReset()
})

describe('POST /api/v1/me/bootstrap', () => {
  it('returns 405 on non-POST', async () => {
    const res = mockRes()
    await call(mockReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('handles OPTIONS preflight', async () => {
    const res = mockRes()
    await call(mockReq({ method: 'OPTIONS' }), res)
    expect(res.statusCode).toBe(204)
  })

  it('aborts when unauthenticated', async () => {
    vi.mocked(requireUser).mockResolvedValue(null)
    const res = mockRes()
    await call(mockReq(), res)
    expect(findInvitesForEmail).not.toHaveBeenCalled()
  })

  it('returns 0 when there are no pending invites', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(findInvitesForEmail).mockResolvedValue([])

    const res = mockRes()
    await call(mockReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ redeemed: 0 })
    expect(insertProjectMembership).not.toHaveBeenCalled()
  })

  it('redeems each pending invite into a membership and deletes the invite', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(findInvitesForEmail).mockResolvedValue([
      { projectKey: 'p1', email: 'a@example.com', role: 'member', invitedBy: 'admin-1', createdAt: '' },
      { projectKey: 'p2', email: 'a@example.com', role: 'admin', invitedBy: 'admin-2', createdAt: '' },
    ])

    const res = mockRes()
    await call(mockReq(), res)

    expect(insertProjectMembership).toHaveBeenCalledTimes(2)
    expect(insertProjectMembership).toHaveBeenNthCalledWith(1, {
      projectKey: 'p1',
      userId: 'user-1',
      role: 'member',
    })
    expect(insertProjectMembership).toHaveBeenNthCalledWith(2, {
      projectKey: 'p2',
      userId: 'user-1',
      role: 'admin',
    })
    expect(deleteInvite).toHaveBeenCalledTimes(2)
    expect(res.body).toEqual({ redeemed: 2 })
  })

  it('returns 500 when the store throws', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(findInvitesForEmail).mockRejectedValue(new Error('boom'))

    const res = mockRes()
    await call(mockReq(), res)

    expect(res.statusCode).toBe(500)
    expect((res.body as { error: string }).error).toBe('boom')
  })
})
