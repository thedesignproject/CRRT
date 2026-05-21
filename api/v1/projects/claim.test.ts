import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
}))

vi.mock('../../_lib/store.js', () => ({
  countProjectAdmins: vi.fn(),
  createProject: vi.fn(),
  deleteInvite: vi.fn(),
  findInvite: vi.fn(),
  getProject: vi.fn(),
  insertProjectMembership: vi.fn(),
}))

import handler from './claim.js'
import { requireUser } from '../../_lib/auth.js'
import {
  countProjectAdmins,
  createProject,
  deleteInvite,
  findInvite,
  getProject,
  insertProjectMembership,
} from '../../_lib/store.js'

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
const PROJECT = {
  publicKey: 'demo',
  slug: 'demo',
  name: 'demo',
  claimable: true,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(getProject).mockReset()
  vi.mocked(createProject).mockReset()
  vi.mocked(countProjectAdmins).mockReset()
  vi.mocked(insertProjectMembership).mockReset()
  vi.mocked(findInvite).mockReset()
  vi.mocked(deleteInvite).mockReset()
})

describe('POST /api/v1/projects/claim', () => {
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

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireUser).mockResolvedValue(null)
    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)
    expect(requireUser).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it('rejects missing projectKey', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    const res = mockRes()
    await call(mockReq({ body: {} }), res)
    expect(res.statusCode).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/Missing projectKey/)
  })

  it('rejects invalid projectKey format', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'BAD KEY!' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it('creates a new project and assigns the user as admin when the key is unknown', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockResolvedValue(null)
    vi.mocked(createProject).mockResolvedValue(PROJECT)

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(createProject).toHaveBeenCalledWith({
      name: 'demo',
      publicKey: 'demo',
      userId: 'user-1',
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({ project: PROJECT, role: 'admin', created: true })
  })

  it('joins an existing claimable project as admin when no admins yet', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockResolvedValue(PROJECT)
    vi.mocked(countProjectAdmins).mockResolvedValue(0)

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(insertProjectMembership).toHaveBeenCalledWith({
      projectKey: 'demo',
      userId: 'user-1',
      role: 'admin',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ project: PROJECT, role: 'admin', created: false })
  })

  it('joins an existing claimable project as member when an admin already exists', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockResolvedValue(PROJECT)
    vi.mocked(countProjectAdmins).mockResolvedValue(1)

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(insertProjectMembership).toHaveBeenCalledWith({
      projectKey: 'demo',
      userId: 'user-1',
      role: 'member',
    })
    expect(res.body).toEqual({ project: PROJECT, role: 'member', created: false })
  })

  it('redeems an invite on an invite-only project', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockResolvedValue({ ...PROJECT, claimable: false })
    vi.mocked(findInvite).mockResolvedValue({
      projectKey: 'demo',
      email: 'a@example.com',
      role: 'member',
      invitedBy: 'admin-1',
      createdAt: '',
    })

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(findInvite).toHaveBeenCalledWith('demo', 'a@example.com')
    expect(insertProjectMembership).toHaveBeenCalledWith({
      projectKey: 'demo',
      userId: 'user-1',
      role: 'member',
    })
    expect(deleteInvite).toHaveBeenCalledWith('demo', 'a@example.com')
    expect(res.body).toEqual({ project: { ...PROJECT, claimable: false }, role: 'member', created: false })
  })

  it('rejects with 403 when project is invite-only and no invite matches', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockResolvedValue({ ...PROJECT, claimable: false })
    vi.mocked(findInvite).mockResolvedValue(null)

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(res.statusCode).toBe(403)
    expect(insertProjectMembership).not.toHaveBeenCalled()
  })

  it('returns 500 when the store throws', async () => {
    vi.mocked(requireUser).mockResolvedValue(USER)
    vi.mocked(getProject).mockRejectedValue(new Error('db down'))

    const res = mockRes()
    await call(mockReq({ body: { projectKey: 'demo' } }), res)

    expect(res.statusCode).toBe(500)
    expect((res.body as { error: string }).error).toBe('db down')
  })
})
