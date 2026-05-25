import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getSupabase: vi.fn() }))

import { getSupabase } from './supabase.js'
import {
  claimProject,
  ensurePublicProject,
  getProjectMember,
  isProjectMember,
  listProjectsForUser,
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
  vi.mocked(getSupabase).mockReset()
})

describe('ensurePublicProject', () => {
  it('returns the existing project without inserting', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({ maybeSingleResults: [{ data: PROJECT_ROW, error: null }] }) as never,
    )

    const result = await ensurePublicProject('pk')
    expect(result.publicKey).toBe('pk')
  })

  it('inserts the project and seeds the repo config when missing', async () => {
    vi.mocked(getSupabase).mockReturnValue(
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
    vi.mocked(getSupabase).mockReturnValue(
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
    vi.mocked(getSupabase).mockReturnValue(
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
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: null, error: { code: '50000', message: 'boom' } },
      }) as never,
    )

    await expect(ensurePublicProject('pk')).rejects.toThrow('boom')
  })

  it('throws when seeding the repo config fails with a non-conflict error', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      buildSupabase({
        maybeSingleResults: [{ data: null, error: null }],
        insertSingleResult: { data: PROJECT_ROW, error: null },
        repoInsertResult: { error: { code: '50000', message: 'repo boom' } },
      }) as never,
    )

    await expect(ensurePublicProject('pk')).rejects.toThrow('repo boom')
  })

  it('ignores a 23505 on the repo config insert (already exists)', async () => {
    vi.mocked(getSupabase).mockReturnValue(
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
      }
    }),
  }
}

describe('membership helpers + claim', () => {
  it('getProjectMember + isProjectMember cover hit / miss / error', async () => {
    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: { role: 'admin' }, error: null },
    }) as never)
    expect(await getProjectMember('u', 'p')).toEqual({ role: 'admin' })
    expect(await isProjectMember('u', 'p')).toBe(true)

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: null, error: null },
    }) as never)
    expect(await getProjectMember('u', 'p')).toBeNull()
    expect(await isProjectMember('u', 'p')).toBe(false)

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberSingle: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(getProjectMember('u', 'p')).rejects.toThrow('boom')
  })

  it('listProjectsForUser returns empty / member-error / joined rows / projects-error', async () => {
    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({ memberList: { data: [], error: null } }) as never)
    expect(await listProjectsForUser('u')).toEqual([])

    // defensive `data || []` fallback when supabase returns data:null, error:null
    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({ memberList: { data: null, error: null } }) as never)
    expect(await listProjectsForUser('u')).toEqual([])

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listProjectsForUser('u')).rejects.toThrow('boom')

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: [{ project_key: 'p1' }], error: null },
      projectsIn: { data: [PROJECT_ROW], error: null },
    }) as never)
    expect((await listProjectsForUser('u')).map((p) => p.publicKey)).toEqual(['pk'])

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      memberList: { data: [{ project_key: 'p1' }], error: null },
      projectsIn: { data: null, error: { message: 'boom' } },
    }) as never)
    await expect(listProjectsForUser('u')).rejects.toThrow('boom')
  })

  it('claimProject: success path', async () => {
    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
    }) as never)
    expect((await claimProject('u', 'pk')).publicKey).toBe('pk')
  })

  it('claimProject: not_found / already_claimed / 23505 race / member-insert error / update error', async () => {
    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: null, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('not_found')

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [], error: null },
      projectsSingle: { data: PROJECT_ROW, error: null },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('already_claimed')

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
      memberInsertError: { code: '23505', message: 'dup' },
    }) as never)
    expect((await claimProject('u', 'pk')).publicKey).toBe('pk')

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: [PROJECT_ROW], error: null },
      memberInsertError: { code: '50000', message: 'boom' },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('boom')

    vi.mocked(getSupabase).mockReturnValue(membershipSupabase({
      projectsUpdate: { data: null, error: { message: 'db boom' } },
    }) as never)
    await expect(claimProject('u', 'pk')).rejects.toThrow('db boom')
  })
})
