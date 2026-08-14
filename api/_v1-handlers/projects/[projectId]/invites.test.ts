import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  createInvite: vi.fn(),
  createNotification: vi.fn(),
  deleteProjectInvite: vi.fn(),
  findUserIdByEmail: vi.fn(),
  getProjectMember: vi.fn(),
  listProjectInvites: vi.fn(),
}))

import handler from './invites.js'
import { requireUser } from '../../../_lib/auth.js'
import {
  createInvite,
  createNotification,
  deleteProjectInvite,
  findUserIdByEmail,
  getProjectMember,
  listProjectInvites,
} from '../../../_lib/store.js'

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
  vi.mocked(getProjectMember).mockReset()
  vi.mocked(createInvite).mockReset()
  vi.mocked(findUserIdByEmail).mockReset()
  vi.mocked(createNotification).mockReset()
  vi.mocked(listProjectInvites).mockReset()
  vi.mocked(deleteProjectInvite).mockReset()
})

describe('api/v1/projects/[projectId]/invites', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects unsupported methods + unauthenticated + missing projectKey', async () => {
    // unsupported method
    let res = mockRes()
    await call({ method: 'PUT', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    // unauthenticated
    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)

    // missing projectKey
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
  })

  it('enforces admin membership for every method', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    // non-member
    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    // member but not admin
    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('GET lists pending invites', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(listProjectInvites).mockResolvedValueOnce([{ email: 'x@y.z' }] as never)
    const res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ email: 'x@y.z' }])
  })

  it('DELETE cancels an invite (missing email, not found, success)', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    // missing email
    let res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // not found
    vi.mocked(deleteProjectInvite).mockResolvedValueOnce(false)
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', email: 'X@Y.Z' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // success (email normalized)
    vi.mocked(deleteProjectInvite).mockResolvedValueOnce(true)
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', email: 'X@Y.Z' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(deleteProjectInvite).toHaveBeenCalledWith('p', 'x@y.z')
  })

  it('POST validates email + already_invited + happy paths + errors', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    // no body → invalid email
    let res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // non-string email → invalid
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 123 }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // bad email string
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'nope' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // already_invited
    vi.mocked(createInvite).mockRejectedValueOnce(new Error('already_invited'))
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z' }, headers: {} }, res)
    expect(res.statusCode).toBe(409)

    // happy path: invitee exists → notification fired
    vi.mocked(createInvite).mockResolvedValueOnce({ projectKey: 'p', email: 'x@y.z' } as never)
    vi.mocked(findUserIdByEmail).mockResolvedValueOnce('invitee-1')
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z', role: 'admin' }, headers: {} }, res)
    expect(res.statusCode).toBe(201)
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'invitee-1', kind: 'invite.received',
    }))

    // happy path: invitee has no account → notification skipped
    vi.mocked(createInvite).mockResolvedValueOnce({ projectKey: 'p', email: 'x@y.z' } as never)
    vi.mocked(findUserIdByEmail).mockResolvedValueOnce(null)
    vi.mocked(createNotification).mockClear()
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z' }, headers: {} }, res)
    expect(res.statusCode).toBe(201)
    expect(createNotification).not.toHaveBeenCalled()

    // notif emit fails → invite still returns 201 (fanout is fire-and-forget)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(createInvite).mockResolvedValueOnce({ projectKey: 'p', email: 'x@y.z' } as never)
    vi.mocked(findUserIdByEmail).mockResolvedValueOnce('invitee-1')
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('notif down'))
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z' }, headers: {} }, res)
    expect(res.statusCode).toBe(201)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()

    // generic 500
    vi.mocked(createInvite).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)

    // non-Error throw → 500
    vi.mocked(createInvite).mockImplementationOnce(() => { throw 'string-not-error' })
    res = mockRes()
    await call({ method: 'POST', query: { projectId: 'p' }, body: { email: 'x@y.z' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })
})
