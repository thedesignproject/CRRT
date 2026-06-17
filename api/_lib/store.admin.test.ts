import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { listAllUsers, listProjectsWithComments } from './store.js'

// A chainable, awaitable query stub: select/in/eq/order all return `this`, and
// awaiting the object resolves to the configured { data, error } result.
function qb(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'eq', 'order']) obj[m] = vi.fn(() => obj)
  obj.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return obj
}

type Tables = {
  project_members?: { data: unknown; error: unknown }
}

type Rpcs = {
  admin_user_project_counts?: { data: unknown; error: unknown }
  admin_projects_with_comments?: { data: unknown; error: unknown }
}

function buildClient(opts: { listUsers?: unknown; tables?: Tables; rpcs?: Rpcs }) {
  const rpc = vi.fn(async (name: string) => {
    const r = opts.rpcs?.[name as keyof Rpcs]
    if (!r) throw new Error(`Unmocked rpc ${name}`)
    return r
  })
  const client = {
    auth: { admin: { listUsers: opts.listUsers ?? vi.fn() } },
    from: vi.fn((table: string) => {
      const t = opts.tables?.[table as keyof Tables]
      if (!t) throw new Error(`Unmocked table ${table}`)
      return qb(t)
    }),
    rpc,
  }
  vi.mocked(getServiceSupabase).mockReturnValue(client as never)
  return { rpc }
}

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReset()
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listAllUsers', () => {
  it('returns users newest-first with project counts', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          { id: 'a', email: 'a@x.com', created_at: '2026-01-01T00:00:00Z' },
          { id: 'b', email: null, created_at: '2026-03-01T00:00:00Z' },
        ],
      },
      error: null,
    })
    const { rpc } = buildClient({
      listUsers,
      rpcs: { admin_user_project_counts: { data: [{ user_id: 'a', project_count: 2 }], error: null } },
    })

    const users = await listAllUsers()
    expect(users).toEqual([
      { id: 'b', email: null, createdAt: '2026-03-01T00:00:00Z', projectCount: 0 },
      { id: 'a', email: 'a@x.com', createdAt: '2026-01-01T00:00:00Z', projectCount: 2 },
    ])
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 200 })
    expect(rpc).toHaveBeenCalledWith('admin_user_project_counts')
  })

  it('pages through the admin API until a short batch', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: `p1-${i}`,
      email: `p1-${i}@x.com`,
      created_at: '2026-01-01T00:00:00Z',
    }))
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [{ id: 'last', email: 'l@x.com', created_at: '2026-02-01T00:00:00Z' }] }, error: null })
    buildClient({ listUsers, rpcs: { admin_user_project_counts: { data: [], error: null } } })

    const users = await listAllUsers()
    expect(users).toHaveLength(201)
    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 200 })
    expect(users[0].id).toBe('last') // newest first
  })

  it('throws when the admin API errors', async () => {
    buildClient({ listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: 'auth down' } }) })
    await expect(listAllUsers()).rejects.toThrow('auth down')
  })

  it('throws when the project-count RPC errors', async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: { users: [] }, error: null })
    buildClient({ listUsers, rpcs: { admin_user_project_counts: { data: null, error: { message: 'db down' } } } })
    await expect(listAllUsers()).rejects.toThrow('db down')
  })

  it('tolerates null data from both sources', async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: null, error: null })
    buildClient({ listUsers, rpcs: { admin_user_project_counts: { data: null, error: null } } })
    expect(await listAllUsers()).toEqual([])
  })
})

describe('listProjectsWithComments', () => {
  function stubEmails(map: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = decodeURIComponent(url.split('/').pop() as string)
        const email = map[id]
        if (!email) return { ok: false } as never
        return { ok: true, json: async () => ({ email }) } as never
      }),
    )
  }

  // The RPC returns rows already aggregated (count + latest) and ordered by
  // latest-comment desc; the store maps them and resolves member emails.
  const PROJECT_ROWS = [
    {
      public_key: 'p2',
      name: 'Two',
      claimable: true,
      created_at: '2025-12-02T00:00:00Z',
      comment_count: 1,
      latest_comment_at: '2026-05-01T00:00:00Z',
    },
    {
      public_key: 'p1',
      name: 'One',
      claimable: false,
      created_at: '2025-12-01T00:00:00Z',
      comment_count: 3,
      latest_comment_at: '2026-01-03T00:00:00Z',
    },
  ]

  it('maps aggregated rows and resolves members with roles, bounded by p_limit', async () => {
    const { rpc } = buildClient({
      rpcs: { admin_projects_with_comments: { data: PROJECT_ROWS, error: null } },
      tables: {
        project_members: {
          data: [
            { project_key: 'p1', user_id: 'owner1', role: 'admin' },
            { project_key: 'p1', user_id: 'mem1', role: 'member' },
            { project_key: 'p1', user_id: 'ghost', role: 'admin' }, // email won't resolve → dropped
          ],
          error: null,
        },
      },
    })
    stubEmails({ owner1: 'owner1@x.com', mem1: 'mem1@x.com' })

    const projects = await listProjectsWithComments()
    expect(projects).toEqual([
      {
        publicKey: 'p2',
        name: 'Two',
        createdAt: '2025-12-02T00:00:00Z',
        commentCount: 1,
        latestCommentAt: '2026-05-01T00:00:00Z',
        claimed: false,
        members: [],
      },
      {
        publicKey: 'p1',
        name: 'One',
        createdAt: '2025-12-01T00:00:00Z',
        commentCount: 3,
        latestCommentAt: '2026-01-03T00:00:00Z',
        claimed: true,
        members: [
          { email: 'owner1@x.com', role: 'admin' },
          { email: 'mem1@x.com', role: 'member' },
        ],
      },
    ])
    expect(rpc).toHaveBeenCalledWith('admin_projects_with_comments', { p_limit: 100 })
  })

  it('returns [] when no project has comments', async () => {
    buildClient({ rpcs: { admin_projects_with_comments: { data: [], error: null } } })
    expect(await listProjectsWithComments()).toEqual([])
  })

  it('throws when the projects RPC errors', async () => {
    buildClient({ rpcs: { admin_projects_with_comments: { data: null, error: { message: 'p down' } } } })
    await expect(listProjectsWithComments()).rejects.toThrow('p down')
  })

  it('throws when the members query errors', async () => {
    buildClient({
      rpcs: { admin_projects_with_comments: { data: PROJECT_ROWS, error: null } },
      tables: { project_members: { data: null, error: { message: 'm down' } } },
    })
    await expect(listProjectsWithComments()).rejects.toThrow('m down')
  })

  it('returns [] when the projects RPC yields null data', async () => {
    buildClient({ rpcs: { admin_projects_with_comments: { data: null, error: null } } })
    expect(await listProjectsWithComments()).toEqual([])
  })

  it('tolerates null member data', async () => {
    buildClient({
      rpcs: { admin_projects_with_comments: { data: PROJECT_ROWS, error: null } },
      tables: { project_members: { data: null, error: null } },
    })
    const projects = await listProjectsWithComments()
    expect(projects.map((p) => p.members)).toEqual([[], []])
  })
})
