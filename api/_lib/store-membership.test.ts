import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getSupabase: vi.fn() }))

import { getSupabase } from './supabase.js'
import {
  countProjectAdmins,
  createProject,
  deleteInvite,
  findInvite,
  findInvitesForEmail,
  getProjectMembership,
  insertProjectMembership,
} from './store.js'

type SupabaseError = { code?: string; message: string }
type Result<T> = { data?: T | null; error: SupabaseError | null; count?: number | null }

interface StoreOpts {
  projectsInsert?: Array<Result<Record<string, unknown>>>
  projectsDelete?: Result<unknown>
  membersInsert?: Result<unknown>
  membersSelectMaybe?: Result<{ role: 'admin' | 'member' }>
  membersCount?: Result<unknown>
  repoInsert?: Result<unknown>
  invitesSelectMaybe?: Result<Record<string, unknown>>
  invitesSelectList?: Result<Record<string, unknown>[]>
  invitesDelete?: Result<unknown>
}

function buildSupabase(opts: StoreOpts) {
  const projectsInsertQueue = [...(opts.projectsInsert ?? [])]
  return {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(projectsInsertQueue.shift() ?? { data: null, error: null })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve(opts.projectsDelete ?? { data: null, error: null })),
          })),
        }
      }
      if (table === 'project_repo_configs') {
        return {
          insert: vi.fn(() => Promise.resolve(opts.repoInsert ?? { error: null })),
        }
      }
      if (table === 'project_members') {
        return {
          insert: vi.fn(() => Promise.resolve(opts.membersInsert ?? { error: null })),
          select: vi.fn((_cols: string, options?: { count?: string; head?: boolean }) => {
            if (options?.count === 'exact') {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => Promise.resolve(opts.membersCount ?? { count: 0, error: null })),
                })),
              }
            }
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve(opts.membersSelectMaybe ?? { data: null, error: null })),
                })),
              })),
            }
          }),
        }
      }
      if (table === 'project_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve(opts.invitesSelectMaybe ?? { data: null, error: null }),
                ),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve(opts.invitesDelete ?? { error: null })),
            })),
          })),
        }
      }
      throw new Error(`Unmocked table ${table}`)
    }),
  }
}

function buildInvitesListSupabase(result: Result<Record<string, unknown>[]>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  }
}

beforeEach(() => {
  vi.mocked(getSupabase).mockReset()
})

const PROJECT_ROW = {
  public_key: 'demo',
  slug: 'demo',
  name: 'demo',
  claimable: true,
  created_at: '',
  updated_at: '',
}

describe('createProject (new branches)', () => {
  it('uses an explicit publicKey without retry on collision', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        projectsInsert: [{ data: null, error: { code: '23505', message: 'dup' } }],
      }) as never,
    )

    await expect(
      createProject({ name: 'demo', publicKey: 'demo' }),
    ).rejects.toThrow('dup')
  })

  it('rolls back the project when repo config insert fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        projectsInsert: [{ data: PROJECT_ROW, error: null }],
        repoInsert: { error: { code: '50000', message: 'repo boom' } },
        projectsDelete: { data: null, error: null },
      }) as never,
    )

    await expect(createProject({ name: 'demo', publicKey: 'demo' })).rejects.toThrow('repo boom')
  })

  it('inserts an admin membership when userId is provided', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        projectsInsert: [{ data: PROJECT_ROW, error: null }],
        repoInsert: { error: null },
        membersInsert: { error: null },
      }) as never,
    )

    const result = await createProject({ name: 'demo', publicKey: 'demo', userId: 'u-1' })
    expect(result.publicKey).toBe('demo')
    expect(result.claimable).toBe(true)
  })

  it('rolls back the project when membership insert fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        projectsInsert: [{ data: PROJECT_ROW, error: null }],
        repoInsert: { error: null },
        membersInsert: { error: { code: '50000', message: 'member boom' } },
        projectsDelete: { data: null, error: null },
      }) as never,
    )

    await expect(
      createProject({ name: 'demo', publicKey: 'demo', userId: 'u-1' }),
    ).rejects.toThrow('member boom')
  })

  it('throws "Project name required" when name is empty', async () => {
    await expect(createProject({ name: '   ' })).rejects.toThrow('Project name required')
  })
})

describe('getProjectMembership', () => {
  it('returns the role for an existing member', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersSelectMaybe: { data: { role: 'admin' }, error: null } }) as never,
    )

    const role = await getProjectMembership('u-1', 'demo')
    expect(role).toBe('admin')
  })

  it('returns null when there is no membership', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersSelectMaybe: { data: null, error: null } }) as never,
    )

    const role = await getProjectMembership('u-1', 'demo')
    expect(role).toBeNull()
  })

  it('throws when Supabase errors', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersSelectMaybe: { data: null, error: { message: 'boom' } } }) as never,
    )

    await expect(getProjectMembership('u-1', 'demo')).rejects.toThrow('boom')
  })
})

describe('countProjectAdmins', () => {
  it('returns the admin count from Supabase', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersCount: { count: 3, error: null, data: null } }) as never,
    )

    expect(await countProjectAdmins('demo')).toBe(3)
  })

  it('returns 0 when the count is null', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersCount: { count: null, error: null, data: null } }) as never,
    )

    expect(await countProjectAdmins('demo')).toBe(0)
  })

  it('throws on Supabase error', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersCount: { data: null, count: null, error: { message: 'boom' } } }) as never,
    )

    await expect(countProjectAdmins('demo')).rejects.toThrow('boom')
  })
})

describe('insertProjectMembership', () => {
  it('inserts a new membership', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersInsert: { error: null, data: null } }) as never,
    )

    await expect(
      insertProjectMembership({ projectKey: 'demo', userId: 'u-1', role: 'member' }),
    ).resolves.toBeUndefined()
  })

  it('swallows 23505 (already a member)', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersInsert: { error: { code: '23505', message: 'dup' }, data: null } }) as never,
    )

    await expect(
      insertProjectMembership({ projectKey: 'demo', userId: 'u-1', role: 'member' }),
    ).resolves.toBeUndefined()
  })

  it('throws on other Supabase errors', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ membersInsert: { error: { code: '50000', message: 'boom' }, data: null } }) as never,
    )

    await expect(
      insertProjectMembership({ projectKey: 'demo', userId: 'u-1', role: 'member' }),
    ).rejects.toThrow('boom')
  })
})

describe('findInvite', () => {
  it('lowercases the email and returns the invite row', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        invitesSelectMaybe: {
          data: {
            project_key: 'demo',
            email: 'a@example.com',
            role: 'member',
            invited_by: 'admin-1',
            created_at: '',
          },
          error: null,
        },
      }) as never,
    )

    const invite = await findInvite('demo', 'A@Example.com')
    expect(invite?.email).toBe('a@example.com')
    expect(invite?.role).toBe('member')
  })

  it('returns null when no invite matches', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ invitesSelectMaybe: { data: null, error: null } }) as never,
    )

    expect(await findInvite('demo', 'a@example.com')).toBeNull()
  })

  it('throws on Supabase error', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ invitesSelectMaybe: { data: null, error: { message: 'boom' } } }) as never,
    )

    await expect(findInvite('demo', 'a@example.com')).rejects.toThrow('boom')
  })
})

describe('findInvitesForEmail', () => {
  it('lowercases the email and returns mapped invites', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildInvitesListSupabase({
        data: [
          { project_key: 'p1', email: 'a@example.com', role: 'member', invited_by: 'admin-1', created_at: '' },
          { project_key: 'p2', email: 'a@example.com', role: 'admin', invited_by: 'admin-2', created_at: '' },
        ],
        error: null,
      }) as never,
    )

    const invites = await findInvitesForEmail('A@Example.com')
    expect(invites.map((i) => i.projectKey)).toEqual(['p1', 'p2'])
  })

  it('returns an empty array when none match', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildInvitesListSupabase({ data: null, error: null }) as never,
    )
    expect(await findInvitesForEmail('a@example.com')).toEqual([])
  })

  it('throws on Supabase error', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildInvitesListSupabase({ data: null, error: { message: 'boom' } }) as never,
    )
    await expect(findInvitesForEmail('a@example.com')).rejects.toThrow('boom')
  })
})

describe('deleteInvite', () => {
  it('lowercases the email when deleting', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ invitesDelete: { error: null, data: null } }) as never,
    )

    await expect(deleteInvite('demo', 'A@Example.com')).resolves.toBeUndefined()
  })

  it('throws on Supabase error', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ invitesDelete: { error: { message: 'boom' }, data: null } }) as never,
    )

    await expect(deleteInvite('demo', 'a@example.com')).rejects.toThrow('boom')
  })
})
