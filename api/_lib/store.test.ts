import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import {
  acceptInvite,
  claimProject,
  createInvite,
  createOrIncrementCommentActivityNotification,
  createNotification,
  createPublicComment,
  declineInvite,
  ensurePublicProject,
  findUserIdByEmail,
  getComment,
  getProjectMember,
  listAcceptedCommentsByIds,
  listAcceptedCommentsForPage,
  listAcceptedCommentsForProject,
  listComments,
  listCommentsForShare,
  listProjectMemberIds,
  updateImplementationStatus,
  updateReviewStatus,
  isProjectKeyAvailable,
  isProjectMember,
  isValidProjectKey,
  listInvitesForEmail,
  listNotificationsForUser,
  listProjectsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  notifyProjectMembersOfCommentActivity,
  releaseCommentActivityEmailReservation,
  reserveCommentActivityEmail,
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

describe('reserveCommentActivityEmail', () => {
  it('returns the reservation decision and floors finite cooldown seconds', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { should_send: true, activity_count: 3 },
      error: null,
    })
    const rpc = vi.fn(() => ({ single }))
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    await expect(reserveCommentActivityEmail('pk', 18.9)).resolves.toEqual({
      shouldSend: true,
      activityCount: 3,
    })
    expect(rpc).toHaveBeenCalledWith('reserve_comment_activity_email', {
      p_project_key: 'pk',
      p_cooldown_seconds: 18,
    })
  })

  it('treats invalid cooldown seconds as no cooldown', async () => {
    const rpc = vi.fn()
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    await expect(reserveCommentActivityEmail('pk', Number.NaN)).resolves.toEqual({
      shouldSend: true,
      activityCount: 1,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('propagates RPC errors for positive cooldowns', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'rpc boom' },
    })
    const rpc = vi.fn(() => ({ single }))
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    await expect(reserveCommentActivityEmail('pk', 1)).rejects.toThrow('rpc boom')
    expect(rpc).toHaveBeenCalledWith('reserve_comment_activity_email', {
      p_project_key: 'pk',
      p_cooldown_seconds: 1,
    })
  })

  it('throws when the reservation RPC returns no row', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc: () => ({ single }) } as never)

    await expect(reserveCommentActivityEmail('pk', 5)).rejects.toThrow(
      'reserve_comment_activity_email returned no row',
    )
  })
})

describe('releaseCommentActivityEmailReservation', () => {
  it('restores a failed send reservation as pending activity', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    await expect(releaseCommentActivityEmailReservation('pk', 2.8)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('release_comment_activity_email_reservation', {
      p_project_key: 'pk',
      p_activity_count: 2,
    })

    await expect(releaseCommentActivityEmailReservation('pk', Number.NaN)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenLastCalledWith('release_comment_activity_email_reservation', {
      p_project_key: 'pk',
      p_activity_count: 1,
    })
  })

  it('propagates release RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'release boom' } })
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    await expect(releaseCommentActivityEmailReservation('pk', 0)).rejects.toThrow('release boom')
    expect(rpc).toHaveBeenCalledWith('release_comment_activity_email_reservation', {
      p_project_key: 'pk',
      p_activity_count: 1,
    })
  })
})

type MembershipMocks = {
  memberSingle?: { data: { role: 'admin' | 'member'; is_owner: boolean } | null; error: { message: string } | null }
  memberList?: { data: Array<{ project_key: string }> | null; error: { message: string } | null }
  projectsIn?: { data: ProjectRow[] | null; error: { message: string } | null }
  projectsSingle?: { data: ProjectRow | null; error: { message: string } | null }
  claimRpc?: { data: unknown; error: { message: string } | null }
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
        }
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({ order: vi.fn(() => Promise.resolve(m.projectsIn ?? { data: [], error: null })) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(m.projectsSingle ?? { data: null, error: null })) })),
        })),
      }
    }),
    rpc: vi.fn(() => Promise.resolve(m.claimRpc ?? { data: null, error: null })),
  }
}

describe('membership helpers + claim', () => {
  it('getProjectMember + isProjectMember cover hit / miss / error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: { role: 'admin', is_owner: true }, error: null },
    }) as never)
    expect(await getProjectMember('u', 'p')).toEqual({ role: 'admin', isOwner: true })
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

  it('claimProject atomically returns the claimed project and forwards creation input', async () => {
    const claimedProject = { ...PROJECT_ROW, allowed_origins: ['https://example.com'] }
    const db = membershipSupabase({
      claimRpc: { data: { status: 'claimed', project: claimedProject }, error: null },
    })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)

    expect((await claimProject('u', 'pk', 'Acme')).publicKey).toBe('pk')
    expect(db.rpc).toHaveBeenCalledWith('claim_project', {
      p_user_id: 'u', p_project_key: 'pk', p_name: 'Acme',
    })

    const existingDb = membershipSupabase({
      claimRpc: { data: { status: 'claimed', project: { ...claimedProject, allowed_origins: null } }, error: null },
    })
    vi.mocked(getServiceSupabase).mockReturnValue(existingDb as never)
    await expect(claimProject('u', 'pk')).resolves.toMatchObject({ allowedOrigins: [] })
    expect(existingDb.rpc).toHaveBeenCalledWith('claim_project', {
      p_user_id: 'u', p_project_key: 'pk', p_name: null,
    })
  })

  it.each(['not_found', 'already_claimed'])('claimProject maps %s', async (status) => {
    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      claimRpc: { data: { status }, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow(status)
  })

  it('claimProject fails closed for malformed success data and database errors', async () => {
    const malformedProjects = [
      undefined,
      'not-an-object',
      { ...PROJECT_ROW, allowed_origins: [], public_key: 'another-project' },
      { ...PROJECT_ROW, allowed_origins: [], slug: null },
      { ...PROJECT_ROW, allowed_origins: [], name: null },
      { ...PROJECT_ROW, allowed_origins: [42] },
      { ...PROJECT_ROW, allowed_origins: [], created_at: null },
      { ...PROJECT_ROW, allowed_origins: [], updated_at: null },
    ]
    for (const project of malformedProjects) {
      vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
        claimRpc: { data: { status: 'claimed', project }, error: null },
      }) as never)
      await expect(claimProject('u', 'pk')).rejects.toThrow('invalid_claim_result')
    }

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      claimRpc: { data: { status: 'invalid_input' }, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('invalid_claim_result')

    vi.mocked(getServiceSupabase).mockReturnValue(membershipSupabase({
      claimRpc: { data: null, error: { message: 'db boom' } },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('db boom')
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
  it('createOrIncrementCommentActivityNotification delegates to the atomic RPC', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'n',
        user_id: 'u',
        kind: 'comment.activity',
        payload: { projectKey: 'p', count: 2 },
        read_at: null,
        created_at: 't',
      },
      error: null,
    })
    const rpc = vi.fn(() => ({ single }))
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)

    const notification = await createOrIncrementCommentActivityNotification({
      userId: 'u',
      projectKey: 'p',
      projectName: 'Project',
      commentId: 'c',
      authorName: null,
      pageUrl: 'https://example.com',
    })

    expect(notification.kind).toBe('comment.activity')
    expect(rpc).toHaveBeenCalledWith('create_or_increment_comment_activity_notification', {
      p_user_id: 'u',
      p_project_key: 'p',
      p_project_name: 'Project',
      p_comment_id: 'c',
      p_author_name: null,
      p_page_url: 'https://example.com',
    })

    vi.mocked(getServiceSupabase).mockReturnValue({
      rpc: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })),
    } as never)
    await expect(createOrIncrementCommentActivityNotification({
      userId: 'u',
      projectKey: 'p',
      projectName: 'Project',
      commentId: 'c',
      pageUrl: 'https://example.com',
    })).rejects.toThrow('boom')
  })

  it('notifyProjectMembersOfCommentActivity increments every project member notification', async () => {
    const rpcSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'n',
        user_id: 'u1',
        kind: 'comment.activity',
        payload: { projectKey: 'p', count: 1 },
        read_at: null,
        created_at: 't',
      },
      error: null,
    })
    const rpc = vi.fn(() => ({ single: rpcSingle }))
    vi.mocked(getServiceSupabase).mockReturnValue({
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [
              { user_id: 'u1' },
              { user_id: 'u2' },
            ],
            error: null,
          })),
        })),
      })),
    } as never)

    await notifyProjectMembersOfCommentActivity({
      projectKey: 'p',
      projectName: 'Project',
      commentId: 'c',
      pageUrl: 'https://example.com',
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('create_or_increment_comment_activity_notification', expect.objectContaining({
      p_author_name: null,
    }))
  })

  it('listProjectMemberIds returns member ids without resolving auth emails', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [{ user_id: 'u1' }, { user_id: 'u2' }],
            error: null,
          })),
        })),
      })),
    } as never)

    await expect(listProjectMemberIds('p')).resolves.toEqual(['u1', 'u2'])
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('listProjectMemberIds handles empty results and errors', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    } as never)

    await expect(listProjectMemberIds('p')).resolves.toEqual([])

    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: { message: 'members boom' } })),
        })),
      })),
    } as never)

    await expect(listProjectMemberIds('p')).rejects.toThrow('members boom')
  })

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

describe('comment functions', () => {
  type QueryResult = { data: unknown; error: { message: string } | null }

  const TEXT_RANGE_ROW = {
    id: 'comment-1',
    project_id: 'pk',
    url: 'https://example.com/pricing',
    x: 10,
    y: 20,
    element: 'section.plans > p.disclaimer',
    comment: 'Soften this copy',
    status: 'pending',
    implementation_status: 'unassigned' as const,
    claimed_by_agent_id: null,
    image_url: null,
    author_name: null,
    target_type: 'text_range',
    anchor: { kind: 'text_range', selectedText: 'términos y condiciones' },
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }

  const LEGACY_ROW = {
    ...TEXT_RANGE_ROW,
    id: 'comment-2',
    target_type: null,
    anchor: null,
  }

  function buildCommentsSupabase(opts: {
    result?: QueryResult
    shareItems?: Array<{ comment_id: string }>
  } = {}) {
    const result = opts.result ?? { data: null, error: null }
    const selects: string[] = []
    const inserts: unknown[] = []

    const chain = {
      insert: vi.fn((rows: unknown[]) => {
        inserts.push(rows[0])
        return chain
      }),
      update: vi.fn(() => chain),
      select: vi.fn((columns: string) => {
        selects.push(columns)
        return chain
      }),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(result)),
      single: vi.fn(() => Promise.resolve(result)),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    }

    const supabase = {
      rpc: vi.fn(() => chain),
      from: vi.fn((table: string) => {
        if (table === 'feedback_share_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: opts.shareItems ?? [], error: null })),
            })),
          }
        }
        return chain
      }),
    }

    vi.mocked(getServiceSupabase).mockReturnValue(supabase as never)
    return { selects, inserts }
  }

  it('createPublicComment inserts target metadata and selects it back', async () => {
    const { selects, inserts } = buildCommentsSupabase({
      result: { data: TEXT_RANGE_ROW, error: null },
    })

    const created = await createPublicComment({
      projectKey: 'pk',
      pageUrl: 'https://example.com/pricing',
      x: 10,
      y: 20,
      selector: 'section.plans > p.disclaimer',
      body: 'Soften this copy',
      targetType: 'text_range',
      anchor: { kind: 'text_range', selectedText: 'términos y condiciones' },
    })

    expect((inserts[0] as Record<string, unknown>).target_type).toBe('text_range')
    expect((inserts[0] as Record<string, unknown>).anchor).toEqual({
      kind: 'text_range',
      selectedText: 'términos y condiciones',
    })
    expect(selects[0]).toContain('target_type, anchor')
    expect(created.targetType).toBe('text_range')
    expect(created.anchor).toEqual({ kind: 'text_range', selectedText: 'términos y condiciones' })
  })

  it('createPublicComment defaults to element_point with no anchor', async () => {
    const { inserts } = buildCommentsSupabase({ result: { data: LEGACY_ROW, error: null } })

    const created = await createPublicComment({
      projectKey: 'pk',
      pageUrl: 'https://example.com/pricing',
      x: 10,
      y: 20,
      selector: 'body',
      body: 'Hi',
    })

    expect((inserts[0] as Record<string, unknown>).target_type).toBe('element_point')
    expect((inserts[0] as Record<string, unknown>).anchor).toBeNull()
    expect(created.targetType).toBe('element_point')
    expect(created.anchor).toBeNull()
  })

  it('createPublicComment propagates insert errors', async () => {
    buildCommentsSupabase({ result: { data: null, error: { message: 'comment boom' } } })

    await expect(createPublicComment({
      projectKey: 'pk',
      pageUrl: 'https://example.com/pricing',
      x: 10,
      y: 20,
      selector: 'body',
      body: 'Hi',
    })).rejects.toThrow('comment boom')
  })

  it('listComments maps legacy rows to element_point and selects target metadata', async () => {
    const { selects } = buildCommentsSupabase({ result: { data: [LEGACY_ROW], error: null } })

    const comments = await listComments('pk')

    expect(selects[0]).toContain('target_type, anchor')
    expect(comments[0].targetType).toBe('element_point')
    expect(comments[0].anchor).toBeNull()
  })

  it('getComment selects target metadata and maps text_range rows', async () => {
    const { selects } = buildCommentsSupabase({ result: { data: TEXT_RANGE_ROW, error: null } })

    const comment = await getComment('comment-1')

    expect(selects[0]).toContain('target_type, anchor')
    expect(comment?.targetType).toBe('text_range')
  })

  it('getComment returns null for missing comments', async () => {
    buildCommentsSupabase({ result: { data: null, error: null } })
    expect(await getComment('missing')).toBeNull()
  })

  it('updateReviewStatus keeps target metadata in its response', async () => {
    const { selects } = buildCommentsSupabase({ result: { data: TEXT_RANGE_ROW, error: null } })

    const comment = await updateReviewStatus('project-1', 'comment-1', 'accepted')

    expect(selects[0]).toContain('target_type, anchor')
    expect(comment.anchor).toEqual({ kind: 'text_range', selectedText: 'términos y condiciones' })
  })

  it('updateImplementationStatus keeps target metadata in its response', async () => {
    const { selects } = buildCommentsSupabase({ result: { data: TEXT_RANGE_ROW, error: null } })

    const comment = await updateImplementationStatus('comment-1', { implementationStatus: 'claimed' })

    expect(selects[0]).toContain('target_type, anchor')
    expect(comment.targetType).toBe('text_range')
  })

  it('accepted-comment queries select target metadata', async () => {
    for (const run of [
      () => listAcceptedCommentsForPage('pk', 'https://example.com/pricing'),
      () => listAcceptedCommentsByIds('pk', ['comment-1']),
      () => listAcceptedCommentsForProject('pk'),
    ]) {
      const { selects } = buildCommentsSupabase({ result: { data: [TEXT_RANGE_ROW], error: null } })
      const comments = await run()
      expect(selects[0]).toContain('target_type, anchor')
      expect(comments[0].targetType).toBe('text_range')
    }
  })

  it('listCommentsForShare selects target metadata for selection shares', async () => {
    const { selects } = buildCommentsSupabase({
      result: { data: [TEXT_RANGE_ROW], error: null },
      shareItems: [{ comment_id: 'comment-1' }],
    })

    const comments = await listCommentsForShare({
      id: 'share-1',
      projectId: 'pk',
      scopeType: 'selection',
      scopePageUrl: null,
    })

    expect(selects[0]).toContain('target_type, anchor')
    expect(comments[0].anchor).toEqual({ kind: 'text_range', selectedText: 'términos y condiciones' })
  })
})
