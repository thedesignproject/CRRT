import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import {
  acceptInvite,
  claimProject,
  createInvite,
  createNotification,
  declineInvite,
  ensurePublicProject,
  findUserIdByEmail,
  getProjectMember,
  isProjectKeyAvailable,
  isProjectMember,
  isValidProjectKey,
  listInvitesForEmail,
  listNotificationsForUser,
  listProjectsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  slugifyProjectKey,
  suggestAvailableProjectKey,
} from './store.js'

type ProjectRow = {
  public_key: string
  slug: string
  name: string
  created_at: string
  updated_at: string
}

type Result<T> = { data: T | null; error: { code?: string; message: string } | null }

interface BuildOpts {
  maybeSingleResults?: Array<Result<ProjectRow>>
  insertSingleResult?: Result<ProjectRow>
  repoInsertResult?: { error: { code?: string; message: string } | null }
}

function buildSupabase(opts: BuildOpts) {
  const maybeSingleQueue = [...(opts.maybeSingleResults ?? [])]
  return {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve(maybeSingleQueue.shift() ?? { data: null, error: null }),
              ),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve(opts.insertSingleResult ?? { data: null, error: null }),
              ),
            })),
          })),
        }
      }
      if (table === 'project_repo_configs') {
        return {
          insert: vi.fn(() => Promise.resolve(opts.repoInsertResult ?? { error: null })),
        }
      }
      throw new Error(`Unmocked table ${table}`)
    }),
  }
}

const PROJECT_ROW: ProjectRow = {
  public_key: 'pk',
  slug: 'pk',
  name: 'pk',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReset()
  vi.mocked(getServiceSupabase).mockReset()
})

describe('ensurePublicProject', () => {
  it('returns the existing project without inserting', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({ maybeSingleResults: [{ data: PROJECT_ROW, error: null }] }) as never,
    )

    const result = await ensurePublicProject('pk')
    expect(result.publicKey).toBe('pk')
  })

  it('inserts the project and seeds the repo config when missing', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: PROJECT_ROW, error: null },
        repoInsertResult: { error: null },
      }) as never,
    )

    const result = await ensurePublicProject('pk')
    expect(result.publicKey).toBe('pk')
    expect(result.slug).toBe('pk')
    expect(result.name).toBe('pk')
  })

  it('refetches and returns the project when a concurrent insert wins (23505)', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [
          { data: null, error: null },
          { data: PROJECT_ROW, error: null },
        ],
        insertSingleResult: { data: null, error: { code: '23505', message: 'dup' } },
      }) as never,
    )

    const result = await ensurePublicProject('pk')
    expect(result.publicKey).toBe('pk')
  })

  it('throws when a 23505 hits but the refetch still finds nothing', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [
          { data: null, error: null },
          { data: null, error: null },
        ],
        insertSingleResult: { data: null, error: { code: '23505', message: 'dup' } },
      }) as never,
    )

    await expect(ensurePublicProject('pk')).rejects.toThrow('dup')
  })

  it('throws when the project insert fails with a non-conflict error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: null, error: { code: '50000', message: 'boom' } },
      }) as never,
    )

    await expect(ensurePublicProject('pk')).rejects.toThrow('boom')
  })

  it('throws when seeding the repo config fails with a non-conflict error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: PROJECT_ROW, error: null },
        repoInsertResult: { error: { code: '50000', message: 'repo boom' } },
      }) as never,
    )

    await expect(ensurePublicProject('pk')).rejects.toThrow('repo boom')
  })

  it('ignores a 23505 on the repo config insert (already exists)', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: PROJECT_ROW, error: null },
        repoInsertResult: { error: { code: '23505', message: 'dup' } },
      }) as never,
    )

    const result = await ensurePublicProject('pk')
    expect(result.publicKey).toBe('pk')
  })
})

type MembershipMocks = {
  memberSingle?: { data: { role: 'admin' | 'member' } | null; error: { message: string } | null }
  memberList?: { data: Array<{ project_key: string }> | null; error: { message: string } | null }
  memberInsertError?: { code?: string; message: string } | null
  projectsIn?: { data: ProjectRow[] | null; error: { message: string } | null }
  projectsUpdate?: { data: ProjectRow[] | null; error: { message: string } | null }
  projectsSingle?: { data: ProjectRow | null; error: { message: string } | null }
  projectInsert?: { data: ProjectRow | null; error: { code?: string; message: string } | null }
  repoInsert?: { error: { code?: string; message: string } | null }
}

function membershipSupabase(m: MembershipMocks = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'project_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_k: string, _v: unknown) => {
              const second = {
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve(m.memberSingle ?? { data: null, error: null })),
                })),
                then: (r: (v: unknown) => unknown) => Promise.resolve(m.memberList ?? { data: [], error: null }).then(r),
              }
              return second
            }),
          })),
          insert: vi.fn(() => Promise.resolve({ error: m.memberInsertError ?? null })),
        }
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({ order: vi.fn(() => Promise.resolve(m.projectsIn ?? { data: [], error: null })) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(m.projectsSingle ?? { data: null, error: null })) })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(m.projectsUpdate ?? { data: [], error: null })) })),
          })),
        })),
        // projects insert → .select().single(); repo-config insert → awaited directly
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(m.projectInsert ?? { data: null, error: null })) })),
          then: (r: (v: unknown) => unknown) => Promise.resolve(m.repoInsert ?? { error: null }).then(r),
        })),
      }
    }),
  }
}

describe('membership helpers + claim', () => {
  it('getProjectMember + isProjectMember cover hit / miss / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: { role: 'admin' }, error: null },
    }) as never)
    expect(await getProjectMember('u', 'p')).toEqual({ role: 'admin' })
    expect(await isProjectMember('u', 'p')).toBe(true)

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: null, error: null },
    }) as never)
    expect(await getProjectMember('u', 'p')).toBeNull()
    expect(await isProjectMember('u', 'p')).toBe(false)

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(getProjectMember('u', 'p')).rejects.toThrow('boom')
  })

  it('listProjectsForUser returns empty / member-error / joined rows / projects-error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({ memberList: { data: [], error: null } }) as never)
    expect(await listProjectsForUser('u')).toEqual([])

    // defensive `data || []` fallback when supabase returns data:null, error:null
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({ memberList: { data: null, error: null } }) as never)
    expect(await listProjectsForUser('u')).toEqual([])

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listProjectsForUser('u')).rejects.toThrow('boom')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: [{ project_key: 'p1' }], error: null },
      projectsIn: { data: [PROJECT_ROW], error: null },
    }) as never)
    expect((await listProjectsForUser('u')).map((p) => p.publicKey)).toEqual(['pk'])

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: [{ project_key: 'p1' }], error: null },
      projectsIn: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listProjectsForUser('u')).rejects.toThrow('boom')
  })

  it('claimProject: success path', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
    }) as never)
    expect((await claimProject('u', 'pk')).publicKey).toBe('pk')
  })

  it('claimProject: not_found / already_claimed / 23505 race / member-insert error / update error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('not_found')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: PROJECT_ROW, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('already_claimed')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
      memberInsertError: { code: '23505', message: 'dup' },
    }) as never)
    expect((await claimProject('u', 'pk')).publicKey).toBe('pk')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
      memberInsertError: { code: '50000', message: 'boom' },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('boom')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: null, error: { message: 'db boom' } },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('db boom')
  })

  it('claimProject create-and-claim: creates a new project when none exists and a name is given', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
      projectInsert: { data: PROJECT_ROW, error: null },
    }) as never)
    expect((await claimProject('u', 'pk', 'Acme')).publicKey).toBe('pk')
  })

  it('claimProject create-and-claim: maps insert 23505 to already_claimed, propagates other errors', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
      projectInsert: { data: null, error: { code: '23505', message: 'dup' } },
    }) as never)
    await expect(claimProject('u', 'pk', 'Acme')).rejects.toThrow('already_claimed')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
      projectInsert: { data: null, error: { code: '50000', message: 'boom' } },
    }) as never)
    await expect(claimProject('u', 'pk', 'Acme')).rejects.toThrow('boom')
  })

  it('claimProject create-and-claim: surfaces repo-config errors but ignores 23505', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
      projectInsert: { data: PROJECT_ROW, error: null },
      repoInsert: { error: { code: '50000', message: 'repo boom' } },
    }) as never)
    await expect(claimProject('u', 'pk', 'Acme')).rejects.toThrow('repo boom')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
      projectInsert: { data: PROJECT_ROW, error: null },
      repoInsert: { error: { code: '23505', message: 'dup' } },
    }) as never)
    expect((await claimProject('u', 'pk', 'Acme')).publicKey).toBe('pk')
  })
})

describe('project key helpers', () => {
  it('slugifyProjectKey lowercases, hyphenates, and trims edges', () => {
    expect(slugifyProjectKey('Acme Marketing Site!')).toBe('acme-marketing-site')
    expect(slugifyProjectKey('  --Hello-- ')).toBe('hello')
  })

  it('isValidProjectKey enforces charset, length, and hyphen rules', () => {
    expect(isValidProjectKey('acme-site')).toBe(true)
    expect(isValidProjectKey('a')).toBe(true)
    expect(isValidProjectKey('')).toBe(false)
    expect(isValidProjectKey('-acme')).toBe(false)
    expect(isValidProjectKey('acme--site')).toBe(false)
    expect(isValidProjectKey('Acme')).toBe(false)
    expect(isValidProjectKey('a'.repeat(64))).toBe(false)
  })

  it('isProjectKeyAvailable reflects whether a row exists', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsSingle: { data: null, error: null },
    }) as never)
    expect(await isProjectKeyAvailable('free')).toBe(true)

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsSingle: { data: PROJECT_ROW, error: null },
    }) as never)
    expect(await isProjectKeyAvailable('taken')).toBe(false)
  })

  it('suggestAvailableProjectKey returns the base when free', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsSingle: { data: null, error: null },
    }) as never)
    expect(await suggestAvailableProjectKey('acme')).toBe('acme')
  })

  it('suggestAvailableProjectKey appends a suffix when the base is taken', async () => {
    // base lookup hits a row → taken; first suffixed candidate lookup finds nothing → free
    const single = vi.fn()
      .mockResolvedValueOnce({ data: PROJECT_ROW, error: null })
      .mockResolvedValue({ data: null, error: null })
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: single })) })),
      })),
    } as never)
    const suggestion = await suggestAvailableProjectKey('acme')
    expect(suggestion).toMatch(/^acme-[a-z0-9]{1,4}$/)
  })

  it('suggestAvailableProjectKey throws when no free key is found', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      projectsSingle: { data: PROJECT_ROW, error: null },
    }) as never)
    await expect(suggestAvailableProjectKey('acme')).rejects.toThrow('no_available_key')
  })
})

type NotifMocks = {
  notifSingle?: { data: unknown; error: { message: string } | null }
  notifList?: { data: unknown[] | null; error: { message: string } | null }
  notifUpdate?: { data: unknown[] | null; error: { message: string } | null }
  notifUpdateAllError?: { message: string } | null
}

function notifSupabase(m: NotifMocks = {}) {
  return {
    from: vi.fn((_table: string) => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(m.notifSingle ?? { data: null, error: null })),
        })),
      })),
      select: vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          is: vi.fn(() => chain),
          then: (r: (v: unknown) => unknown) =>
            Promise.resolve(m.notifList ?? { data: [], error: null }).then(r),
        }
        return chain
      }),
      update: vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          select: vi.fn(() => Promise.resolve(m.notifUpdate ?? { data: [], error: null })),
          then: (r: (v: unknown) => unknown) =>
            Promise.resolve({ error: m.notifUpdateAllError ?? null }).then(r),
        }
        return chain
      }),
    })),
  }
}

describe('notifications helpers', () => {
  it('createNotification: success / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifSingle: { data: { id: 'n', user_id: 'u', kind: 'invite.received', payload: { x: 1 }, read_at: null, created_at: 't' }, error: null },
    }) as never)
    const n = await createNotification({ userId: 'u', kind: 'invite.received', payload: { x: 1 } })
    expect(n.id).toBe('n')

    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifSingle: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(createNotification({ userId: 'u', kind: 'invite.received' })).rejects.toThrow('boom')
  })

  it('listNotificationsForUser: respects unreadOnly + default options + null fallback + error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifList: { data: [{ id: 'n1', user_id: 'u', kind: 'invite.received', payload: null, read_at: null, created_at: 't' }], error: null },
    }) as never)
    expect((await listNotificationsForUser('u', { unreadOnly: true, limit: 10 })).length).toBe(1)
    expect((await listNotificationsForUser('u')).length).toBe(1)

    // defensive `data || []` fallback
    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifList: { data: null, error: null },
    }) as never)
    expect(await listNotificationsForUser('u')).toEqual([])

    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifList: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listNotificationsForUser('u')).rejects.toThrow('boom')
  })

  it('markNotificationRead: hit / miss / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifUpdate: { data: [{ id: 'n' }], error: null },
    }) as never)
    expect(await markNotificationRead('n', 'u')).toBe(true)

    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifUpdate: { data: [], error: null },
    }) as never)
    expect(await markNotificationRead('n', 'u')).toBe(false)

    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifUpdate: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(markNotificationRead('n', 'u')).rejects.toThrow('boom')
  })

  it('markAllNotificationsRead: success / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({}) as never)
    await markAllNotificationsRead('u')

    vi.mocked(getServiceSupabase).mockReturnValue(notifSupabase({
      notifUpdateAllError: { message: 'boom' },
    }) as never)
    await expect(markAllNotificationsRead('u')).rejects.toThrow('boom')
  })
})

type InviteRow = {
  project_key: string
  email: string
  role: 'admin' | 'member'
  invited_by: string
  created_at: string
}

type InviteMocks = {
  inviteSingle?: { data: InviteRow | null; error: { message: string } | null }
  inviteList?: { data: InviteRow[] | null; error: { message: string } | null }
  inviteInsertResult?: { data: InviteRow | null; error: { code?: string; message: string } | null }
  inviteDeleteError?: { message: string } | null
  memberInsertError?: { code?: string; message: string } | null
}

function inviteSupabase(m: InviteMocks = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'project_invites') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(m.inviteInsertResult ?? { data: null, error: null })),
            })),
          })),
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              order: vi.fn(() => chain),
              maybeSingle: vi.fn(() => Promise.resolve(m.inviteSingle ?? { data: null, error: null })),
              then: (r: (v: unknown) => unknown) =>
                Promise.resolve(m.inviteList ?? { data: [], error: null }).then(r),
            }
            return chain
          }),
          delete: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              then: (r: (v: unknown) => unknown) =>
                Promise.resolve({ error: m.inviteDeleteError ?? null }).then(r),
            }
            return chain
          }),
        }
      }
      if (table === 'project_members') {
        return { insert: vi.fn(() => Promise.resolve({ error: m.memberInsertError ?? null })) }
      }
      throw new Error(`Unmocked table ${table}`)
    }),
  }
}

describe('invite helpers', () => {
  const INVITE: InviteRow = { project_key: 'p', email: 'x@y.z', role: 'member', invited_by: 'inviter-1', created_at: 't' }

  it('createInvite: success / already_invited / other error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteInsertResult: { data: INVITE, error: null },
    }) as never)
    expect((await createInvite({ projectKey: 'p', email: 'X@Y.Z', role: 'member', invitedBy: 'inviter-1' })).email).toBe('x@y.z')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteInsertResult: { data: null, error: { code: '23505', message: 'dup' } },
    }) as never)
    await expect(createInvite({ projectKey: 'p', email: 'x@y.z', role: 'member', invitedBy: 'i' })).rejects.toThrow('already_invited')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteInsertResult: { data: null, error: { code: '50000', message: 'boom' } },
    }) as never)
    await expect(createInvite({ projectKey: 'p', email: 'x@y.z', role: 'member', invitedBy: 'i' })).rejects.toThrow('boom')
  })

  it('listInvitesForEmail: success / null fallback / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteList: { data: [INVITE], error: null },
    }) as never)
    expect((await listInvitesForEmail('X@Y.Z')).map((i) => i.projectKey)).toEqual(['p'])

    // defensive `data || []` fallback
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteList: { data: null, error: null },
    }) as never)
    expect(await listInvitesForEmail('x@y.z')).toEqual([])

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteList: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listInvitesForEmail('x@y.z')).rejects.toThrow('boom')
  })

  it('acceptInvite: not_found / happy / membership 23505 tolerated / other error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({ inviteSingle: { data: null, error: null } }) as never)
    await expect(acceptInvite('u', 'x@y.z', 'p')).rejects.toThrow('not_found')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({ inviteSingle: { data: INVITE, error: null } }) as never)
    expect(await acceptInvite('u', 'x@y.z', 'p')).toBe('inviter-1')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteSingle: { data: INVITE, error: null },
      memberInsertError: { code: '23505', message: 'dup' },
    }) as never)
    expect(await acceptInvite('u', 'x@y.z', 'p')).toBe('inviter-1')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteSingle: { data: INVITE, error: null },
      memberInsertError: { code: '50000', message: 'boom' },
    }) as never)
    await expect(acceptInvite('u', 'x@y.z', 'p')).rejects.toThrow('boom')
  })

  it('declineInvite: not_found / happy', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({ inviteSingle: { data: null, error: null } }) as never)
    await expect(declineInvite('x@y.z', 'p')).rejects.toThrow('not_found')

    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({ inviteSingle: { data: INVITE, error: null } }) as never)
    expect(await declineInvite('x@y.z', 'p')).toBe('inviter-1')
  })

  it('getInvite lookup error / deleteInvite error bubble through accept', async () => {
    // getInvite error path
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteSingle: { data: null, error: { message: 'lookup boom' } },
    }) as never)
    await expect(acceptInvite('u', 'x@y.z', 'p')).rejects.toThrow('lookup boom')

    // deleteInvite error path (invite found, member insert ok, delete fails)
    vi.mocked(getServiceSupabase).mockReturnValue(inviteSupabase({
      inviteSingle: { data: INVITE, error: null },
      inviteDeleteError: { message: 'delete boom' },
    }) as never)
    await expect(acceptInvite('u', 'x@y.z', 'p')).rejects.toThrow('delete boom')
  })
})

describe('findUserIdByEmail', () => {
  const origFetch = globalThis.fetch
  const origUrl = process.env.SUPABASE_URL
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supa.example'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key'
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    process.env.SUPABASE_URL = origUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey
  })

  it('returns null when service role key is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(await findUserIdByEmail('x@y.z')).toBeNull()
  })

  it('returns null when SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL
    expect(await findUserIdByEmail('x@y.z')).toBeNull()
  })

  it('returns null when admin endpoint returns non-OK', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as never
    expect(await findUserIdByEmail('x@y.z')).toBeNull()
  })

  it('returns the matching user id when found', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      users: [{ id: 'u-1', email: 'X@Y.Z' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as never
    expect(await findUserIdByEmail('x@y.z')).toBe('u-1')
  })

  it('returns null when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('net') }) as never
    expect(await findUserIdByEmail('x@y.z')).toBeNull()
  })

  it('returns null when response shape is unexpected', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as never
    expect(await findUserIdByEmail('x@y.z')).toBeNull()
  })
})
