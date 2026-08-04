import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/project-role-change-email.js', () => ({
  getProjectRoleChangeDashboardUrl: vi.fn(() => 'https://crrt.ai/dashboard'),
  sendProjectRoleChangeEmail: vi.fn(),
}))
vi.mock('../../../../_lib/store.js', () => ({
  changeProjectMemberRole: vi.fn(),
  getProject: vi.fn(),
  getProjectMember: vi.fn(),
  getUserEmailsByIds: vi.fn(),
  removeProjectMember: vi.fn(),
}))

import handler from './[userId].js'
import { waitUntil } from '@vercel/functions'
import { requireUser } from '../../../../_lib/auth.js'
import { getProjectRoleChangeDashboardUrl, sendProjectRoleChangeEmail } from '../../../../_lib/project-role-change-email.js'
import { changeProjectMemberRole, getProject, getProjectMember, getUserEmailsByIds, removeProjectMember } from '../../../../_lib/store.js'

const TARGET_USER_ID = '00000000-0000-0000-0000-000000000001'

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
  vi.mocked(changeProjectMemberRole).mockReset()
  vi.mocked(getProject).mockReset().mockResolvedValue({ name: 'Demo' } as never)
  vi.mocked(getProjectMember).mockReset()
  vi.mocked(getUserEmailsByIds).mockReset().mockResolvedValue({ [TARGET_USER_ID]: 'member@example.com' })
  vi.mocked(removeProjectMember).mockReset()
  vi.mocked(sendProjectRoleChangeEmail).mockReset().mockResolvedValue({ skipped: false })
  vi.mocked(getProjectRoleChangeDashboardUrl).mockReset().mockReturnValue('https://crrt.ai/dashboard')
  vi.mocked(waitUntil).mockReset()
})

describe('api/v1/projects/[projectId]/members/[userId]', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-DELETE + unauthenticated', async () => {
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' }); return null
    })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates projectKey + userId', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'DELETE', query: { userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: 'not-a-uuid' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid userId' })
  })

  it('enforces admin role', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    vi.mocked(getProjectMember).mockResolvedValueOnce(null)
    let res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('removes a member, 404s a missing one, protects the owner, and handles errors', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    // success
    vi.mocked(removeProjectMember).mockResolvedValueOnce(true)
    let res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(removeProjectMember).toHaveBeenCalledWith('p', 'u', TARGET_USER_ID)
    expect(res.body).toMatchObject({ projectKey: 'p', userId: TARGET_USER_ID })

    // not found
    vi.mocked(removeProjectMember).mockResolvedValueOnce(false)
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // owner protection
    vi.mocked(removeProjectMember).mockRejectedValueOnce(new Error('owner_protected'))
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(409)

    // authorization is rechecked atomically by the removal RPC
    vi.mocked(removeProjectMember).mockRejectedValueOnce(new Error('forbidden'))
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    // generic error
    vi.mocked(removeProjectMember).mockRejectedValueOnce(new Error('db down'))
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(500)

    // non-Error throw → 500 (msg stays undefined)
    vi.mocked(removeProjectMember).mockImplementationOnce(() => { throw 'string-not-error' })
    res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p', userId: TARGET_USER_ID }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  it('validates and applies role changes', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })

    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    const changed = { projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'member', role: 'admin', changed: true }
    vi.mocked(changeProjectMemberRole).mockResolvedValue(changed as never)
    res = mockRes()
    await call({
      method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'admin' }, headers: {},
    }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(changed)
    expect(changeProjectMemberRole).toHaveBeenCalledWith({
      projectKey: 'p', actorUserId: 'u', targetUserId: TARGET_USER_ID, role: 'admin',
    })
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    await vi.mocked(waitUntil).mock.calls[0]?.[0]
    expect(sendProjectRoleChangeEmail).toHaveBeenCalledWith({
      recipient: 'member@example.com', projectName: 'Demo', actorEmail: 'a@b.c',
      previousRole: 'member', role: 'admin', dashboardUrl: 'https://crrt.ai/dashboard',
    })
  })

  it('does not email unchanged roles and skips members without a resolved email', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(changeProjectMemberRole).mockResolvedValue({
      projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'member', role: 'member', changed: false,
    })
    let res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'member' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(waitUntil).not.toHaveBeenCalled()

    vi.mocked(changeProjectMemberRole).mockResolvedValue({
      projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'member', role: 'admin', changed: true,
    })
    vi.mocked(getUserEmailsByIds).mockResolvedValue({})
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'admin' }, headers: {} }, res)
    await vi.mocked(waitUntil).mock.calls[0]?.[0]
    expect(sendProjectRoleChangeEmail).not.toHaveBeenCalled()
  })

  it('logs missing configuration without failing the role change', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'actor@example.com' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(changeProjectMemberRole).mockResolvedValue({
      projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'member', role: 'admin', changed: true,
    })
    vi.mocked(sendProjectRoleChangeEmail).mockResolvedValue({ skipped: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'admin' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    await vi.mocked(waitUntil).mock.calls[0]?.[0]
    expect(warnSpy).toHaveBeenCalledWith('Project role change email skipped: email configuration is missing')
    warnSpy.mockRestore()
  })

  it('does not fail a completed role change when email scheduling throws', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'actor@example.com' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(changeProjectMemberRole).mockResolvedValue({
      projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'member', role: 'admin', changed: true,
    })
    vi.mocked(waitUntil).mockImplementationOnce(() => { throw new Error('runtime unavailable') })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = mockRes()
    await call({
      method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'admin' }, headers: {},
    }, res)

    expect(res.statusCode).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith('Project role change email scheduling failed', expect.any(Error))
    warnSpy.mockRestore()
  })

  it('falls back to the project key, uses a trusted CTA, and isolates background email failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'actor@example.com' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(changeProjectMemberRole).mockResolvedValue({
      projectKey: 'p', userId: TARGET_USER_ID, previousRole: 'admin', role: 'owner', changed: true,
    })
    vi.mocked(getProject).mockResolvedValue(null)
    vi.mocked(sendProjectRoleChangeEmail).mockRejectedValue(new Error('resend down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = mockRes()
    await call({
      method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'owner' },
      headers: { host: 'preview.example.com', 'x-forwarded-proto': 'https' },
    }, res)
    expect(res.statusCode).toBe(200)
    await vi.mocked(waitUntil).mock.calls[0]?.[0]
    expect(sendProjectRoleChangeEmail).toHaveBeenCalledWith(expect.objectContaining({
      projectName: 'p', dashboardUrl: 'https://crrt.ai/dashboard',
    }))
    expect(getProjectRoleChangeDashboardUrl).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('Project role change email failed', expect.any(Error))
    warnSpy.mockRestore()
  })

  it.each([
    ['not_found', 404],
    ['forbidden', 403],
    ['owner_required', 403],
    ['owner_protected', 409],
  ])('maps role change %s errors to %s', async (message, status) => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin' })
    vi.mocked(changeProjectMemberRole).mockRejectedValue(new Error(message))
    const res = mockRes()
    await call({
      method: 'PATCH', query: { projectId: 'p', userId: TARGET_USER_ID }, body: { role: 'member' }, headers: {},
    }, res)
    expect(res.statusCode).toBe(status)
  })
})
