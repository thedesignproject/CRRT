import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeProjectMemberRole, inviteProjectMember } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('project member API', () => {
  it('sends an encoded role-change request', async () => {
    const response = {
      projectKey: 'project/key', userId: 'user/id', previousRole: 'member', role: 'admin', changed: true,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(response) }))

    await expect(changeProjectMemberRole('/api', 'token', 'project/key', 'user/id', 'admin'))
      .resolves.toEqual(response)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/project%2Fkey/members/user%2Fid',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: JSON.stringify({ role: 'admin' }),
      }),
    )
  })

  it('sends project invitations with the default or requested role', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' })
    vi.stubGlobal('fetch', fetch)

    await inviteProjectMember('/api', 'token', 'project/key', 'member@example.com')
    await inviteProjectMember('/api', 'token', 'project/key', 'guest@example.com', 'guest')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/projects/project%2Fkey/invites', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'member@example.com', role: 'member' }),
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/projects/project%2Fkey/invites', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'guest@example.com', role: 'guest' }),
    }))
  })
})
