import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { encodeAdminCursor } from './admin-pagination.js'
import { listAllUsers, listProjectsWithComments } from './store.js'

// A chainable, awaitable query stub: select/in/eq/order all return `this`, and
// awaiting the object resolves to the configured { data, error } result.
function qb(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'eq', 'or', 'order', 'limit']) obj[m] = vi.fn(() => obj)
  obj.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return obj
}

type Tables = {
  project_members?: { data: unknown; error: unknown }
  admin_user_metrics?: { data: unknown; error: unknown }
  admin_project_metrics?: { data: unknown; error: unknown }
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
  return { rpc, from: client.from }
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

  it('tolerates null user metrics', async () => {
    buildClient({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: 'a', created_at: 't' }], nextPage: null }, error: null,
      }),
      tables: { admin_user_metrics: { data: null, error: null } },
    })
    const result = await listAllUsers({ limit: 50 })
    expect(result.items[0].projectsAsAdminCount).toBe(0)
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

  const METRICS = {
    pending_comment_count: 1,
    accepted_comment_count: 1,
    rejected_comment_count: 1,
    unassigned_comment_count: 1,
    claimed_comment_count: 1,
    in_progress_comment_count: 1,
    blocked_comment_count: 0,
    done_comment_count: 0,
    feedback_share_count: 2,
    commented_url_count: 2,
    first_comment_at: '2026-01-01T00:00:00Z',
  }
  const PROJECT_ROWS = [
    {
      ...METRICS,
      public_key: 'p2',
      name: 'Two',
      claimable: true,
      created_at: '2025-12-02T00:00:00Z',
      comment_count: 1,
      last_comment_at: '2026-05-01T00:00:00Z',
    },
    {
      ...METRICS,
      public_key: 'p1',
      name: 'One',
      claimable: false,
      created_at: '2025-12-01T00:00:00Z',
      comment_count: 3,
      last_comment_at: '2026-01-03T00:00:00Z',
    },
  ]

  it('maps one metrics page, resolves members, and returns a cursor', async () => {
    const { rpc } = buildClient({
      tables: {
        admin_project_metrics: { data: PROJECT_ROWS, error: null },
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

    const projects = await listProjectsWithComments({
      limit: 1, sort: 'lastCommentAt', direction: 'desc',
    })
    expect(projects.items).toEqual([
      {
        publicKey: 'p2',
        name: 'Two',
        createdAt: '2025-12-02T00:00:00Z',
        commentCount: 1,
        commentStatusCounts: { pending: 1, accepted: 1, rejected: 1 },
        implementationStatusCounts: {
          unassigned: 1, claimed: 1, inProgress: 1, blocked: 0, done: 0,
        },
        feedbackShareCount: 2,
        commentedUrlCount: 2,
        firstCommentAt: '2026-01-01T00:00:00Z',
        lastCommentAt: '2026-05-01T00:00:00Z',
        claimed: false,
        members: [],
      },
    ])
    expect(projects.hasMore).toBe(true)
    expect(projects.nextCursor).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns [] when no project has comments', async () => {
    buildClient({ tables: { admin_project_metrics: { data: [], error: null } } })
    await expect(listProjectsWithComments({
      limit: 50, sort: 'lastCommentAt', direction: 'desc',
    })).resolves.toEqual({ items: [], nextCursor: null, hasMore: false })
  })

  it('throws when the projects RPC errors', async () => {
    buildClient({ tables: { admin_project_metrics: { data: null, error: { message: 'p down' } } } })
    await expect(listProjectsWithComments({
      limit: 50, sort: 'lastCommentAt', direction: 'desc',
    })).rejects.toThrow('p down')
  })

  it('throws when the members query errors', async () => {
    buildClient({
      tables: {
        admin_project_metrics: { data: PROJECT_ROWS, error: null },
        project_members: { data: null, error: { message: 'm down' } },
      },
    })
    await expect(listProjectsWithComments({
      limit: 50, sort: 'lastCommentAt', direction: 'desc',
    })).rejects.toThrow('m down')
  })

  it('returns [] when the projects RPC yields null data', async () => {
    buildClient({ tables: { admin_project_metrics: { data: null, error: null } } })
    await expect(listProjectsWithComments({
      limit: 50, sort: 'createdAt', direction: 'asc',
    })).resolves.toEqual({ items: [], nextCursor: null, hasMore: false })
  })

  it('tolerates null member data', async () => {
    buildClient({
      tables: {
        admin_project_metrics: { data: PROJECT_ROWS, error: null },
        project_members: { data: null, error: null },
      },
    })
    const projects = await listProjectsWithComments({
      limit: 50, sort: 'commentCount', direction: 'desc',
    })
    expect(projects.items.map((p) => p.members)).toEqual([[], []])
  })

  it('accepts a matching seek cursor and rejects mismatches', async () => {
    const cursor = encodeAdminCursor({
      kind: 'projects', sort: 'feedbackShareCount', direction: 'asc', value: 2, id: 'p1',
    })
    buildClient({ tables: { admin_project_metrics: { data: [], error: null } } })
    await expect(listProjectsWithComments({
      limit: 10, cursor, sort: 'feedbackShareCount', direction: 'asc',
    })).resolves.toEqual({ items: [], nextCursor: null, hasMore: false })
    const descending = encodeAdminCursor({
      kind: 'projects', sort: 'commentCount', direction: 'desc', value: 2, id: 'p1',
    })
    await expect(listProjectsWithComments({
      limit: 10, cursor: descending, sort: 'commentCount', direction: 'desc',
    })).resolves.toEqual({ items: [], nextCursor: null, hasMore: false })
    await expect(listProjectsWithComments({
      limit: 10, cursor, sort: 'commentedUrlCount', direction: 'asc',
    })).rejects.toThrow('Invalid cursor')
  })
})
