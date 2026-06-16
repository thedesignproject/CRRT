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
  comments?: { data: unknown; error: unknown }
  projects?: { data: unknown; error: unknown }
  project_members?: { data: unknown; error: unknown }
}

function buildClient(opts: { listUsers?: unknown; tables?: Tables }) {
  vi.mocked(getServiceSupabase).mockReturnValue({
    auth: { admin: { listUsers: opts.listUsers ?? vi.fn() } },
    from: vi.fn((table: string) => {
      const t = opts.tables?.[table as keyof Tables]
      if (!t) throw new Error(`Unmocked table ${table}`)
      return qb(t)
    }),
  } as never)
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
    buildClient({
      listUsers,
      tables: { project_members: { data: [{ user_id: 'a' }, { user_id: 'a' }], error: null } },
    })

    const users = await listAllUsers()
    expect(users).toEqual([
      { id: 'b', email: null, createdAt: '2026-03-01T00:00:00Z', projectCount: 0 },
      { id: 'a', email: 'a@x.com', createdAt: '2026-01-01T00:00:00Z', projectCount: 2 },
    ])
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 200 })
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
    buildClient({ listUsers, tables: { project_members: { data: [], error: null } } })

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

  it('throws when the membership query errors', async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: { users: [] }, error: null })
    buildClient({ listUsers, tables: { project_members: { data: null, error: { message: 'db down' } } } })
    await expect(listAllUsers()).rejects.toThrow('db down')
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

  it('aggregates comments per project, resolves owners, sorts by latest comment', async () => {
    buildClient({
      tables: {
        comments: {
          data: [
            { project_id: null, created_at: '2026-01-01T00:00:00Z' }, // orphan, skipped
            { project_id: 'p1', created_at: '2026-01-01T00:00:00Z' },
            { project_id: 'p1', created_at: '2026-01-03T00:00:00Z' }, // newer → updates latest
            { project_id: 'p1', created_at: '2026-01-02T00:00:00Z' }, // older → no update
            { project_id: 'p2', created_at: '2026-05-01T00:00:00Z' },
          ],
          error: null,
        },
        projects: {
          data: [
            { public_key: 'p1', name: 'One', claimable: false, created_at: '2025-12-01T00:00:00Z' },
            { public_key: 'p2', name: 'Two', claimable: true, created_at: '2025-12-02T00:00:00Z' },
          ],
          error: null,
        },
        project_members: {
          data: [
            { project_key: 'p1', user_id: 'owner1', role: 'admin' },
            { project_key: 'p1', user_id: 'ghost', role: 'admin' }, // email won't resolve
          ],
          error: null,
        },
      },
    })
    stubEmails({ owner1: 'owner1@x.com' })

    const projects = await listProjectsWithComments()
    expect(projects).toEqual([
      {
        publicKey: 'p2',
        name: 'Two',
        createdAt: '2025-12-02T00:00:00Z',
        commentCount: 1,
        latestCommentAt: '2026-05-01T00:00:00Z',
        claimed: false,
        owners: [],
      },
      {
        publicKey: 'p1',
        name: 'One',
        createdAt: '2025-12-01T00:00:00Z',
        commentCount: 3,
        latestCommentAt: '2026-01-03T00:00:00Z',
        claimed: true,
        owners: ['owner1@x.com'],
      },
    ])
  })

  it('returns [] when no project has comments', async () => {
    buildClient({ tables: { comments: { data: [{ project_id: null, created_at: '2026-01-01T00:00:00Z' }], error: null } } })
    expect(await listProjectsWithComments()).toEqual([])
  })

  it('throws when the comments query errors', async () => {
    buildClient({ tables: { comments: { data: null, error: { message: 'c down' } } } })
    await expect(listProjectsWithComments()).rejects.toThrow('c down')
  })

  it('throws when the projects query errors', async () => {
    buildClient({
      tables: {
        comments: { data: [{ project_id: 'p1', created_at: '2026-01-01T00:00:00Z' }], error: null },
        projects: { data: null, error: { message: 'p down' } },
      },
    })
    await expect(listProjectsWithComments()).rejects.toThrow('p down')
  })

  it('throws when the members query errors', async () => {
    buildClient({
      tables: {
        comments: { data: [{ project_id: 'p1', created_at: '2026-01-01T00:00:00Z' }], error: null },
        projects: { data: [{ public_key: 'p1', name: 'One', claimable: false, created_at: '2025-12-01T00:00:00Z' }], error: null },
        project_members: { data: null, error: { message: 'm down' } },
      },
    })
    await expect(listProjectsWithComments()).rejects.toThrow('m down')
  })
})
