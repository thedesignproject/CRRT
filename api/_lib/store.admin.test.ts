import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { encodeAdminCursor } from './admin-pagination.js'
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
  admin_user_metrics?: { data: unknown; error: unknown }
}

type Rpcs = {
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
  it('returns an enriched first page and a cursor', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          {
            id: 'a', email: 'a@x.com', created_at: '2026-01-01T00:00:00Z',
            last_sign_in_at: '2026-02-01T00:00:00Z', email_confirmed_at: '2026-01-02T00:00:00Z',
          },
          { id: 'b', email: null, created_at: '2025-01-01T00:00:00Z' },
        ],
        nextPage: 2,
      },
      error: null,
    })
    const client = buildClient({
      listUsers,
      tables: {
        admin_user_metrics: {
          data: [{ user_id: 'a', admin_project_count: 2, member_project_count: 3, super_admin: true }],
          error: null,
        },
      },
    })

    const result = await listAllUsers({ limit: 2 })
    expect(result.items).toEqual([
      {
        id: 'a', email: 'a@x.com', createdAt: '2026-01-01T00:00:00Z',
        lastSignInAt: '2026-02-01T00:00:00Z', emailConfirmedAt: '2026-01-02T00:00:00Z',
        projectsAsAdminCount: 2, projectsAsMemberCount: 3, superAdmin: true,
      },
      {
        id: 'b', email: null, createdAt: '2025-01-01T00:00:00Z',
        lastSignInAt: null, emailConfirmedAt: null,
        projectsAsAdminCount: 0, projectsAsMemberCount: 0, superAdmin: false,
      },
    ])
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBeTruthy()
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 2 })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('uses a valid cursor and ends on an empty page without querying metrics', async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: { users: [], nextPage: null }, error: null })
    const client = buildClient({ listUsers })
    const cursor = encodeAdminCursor({ kind: 'users', page: 2, limit: 10, lastId: 'last' })
    await expect(listAllUsers({ limit: 10, cursor })).resolves.toEqual({
      items: [], nextCursor: null, hasMore: false,
    })
    expect(listUsers).toHaveBeenCalledWith({ page: 2, perPage: 10 })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('throws when the admin API errors', async () => {
    buildClient({ listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: 'auth down' } }) })
    await expect(listAllUsers({ limit: 50 })).rejects.toThrow('auth down')
  })

  it('throws on invalid cursors and metric errors', async () => {
    buildClient({ listUsers: vi.fn() })
    await expect(listAllUsers({ limit: 10, cursor: 'bad' })).rejects.toThrow('Invalid cursor')
    const cursor = encodeAdminCursor({ kind: 'users', page: 1, limit: 20, lastId: '' })
    await expect(listAllUsers({ limit: 10, cursor })).rejects.toThrow('Invalid cursor')

    buildClient({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: 'a', created_at: 't' }], nextPage: null }, error: null,
      }),
      tables: { admin_user_metrics: { data: null, error: { message: 'db down' } } },
    })
    await expect(listAllUsers({ limit: 10 })).rejects.toThrow('db down')
  })

  it('tolerates null auth data', async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: null, error: null })
    buildClient({ listUsers })
    expect(await listAllUsers({ limit: 50 })).toEqual({ items: [], nextCursor: null, hasMore: false })
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
