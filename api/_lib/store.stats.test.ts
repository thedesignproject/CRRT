import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { getAdminStats } from './store.js'

type Result = { count: number | null; error: { message: string } | null }

function countQuery(result: Result) {
  const query: Record<string, unknown> = {}
  query.gte = vi.fn(() => query)
  query.then = (resolve: (value: Result) => unknown) => resolve(result)
  return { select: vi.fn(() => query), query }
}

function setup(opts: {
  listUsers: ReturnType<typeof vi.fn>
  counts?: Partial<Record<string, Result>>
}) {
  const queries = new Map<string, ReturnType<typeof countQuery>>()
  const client = {
    auth: { admin: { listUsers: opts.listUsers } },
    from: vi.fn((table: string) => {
      const query = countQuery(opts.counts?.[table] ?? { count: 0, error: null })
      queries.set(table, query)
      return query
    }),
  }
  vi.mocked(getServiceSupabase).mockReturnValue(client as never)
  return { client, queries }
}

beforeEach(() => vi.mocked(getServiceSupabase).mockReset())

describe('getAdminStats', () => {
  it('returns totals and inclusive signup/presence windows', async () => {
    const now = new Date('2026-06-19T00:00:00.000Z')
    const listUsers = vi.fn()
      .mockResolvedValueOnce({
        data: {
          users: [
            { created_at: '2026-06-18T00:00:00.000Z' },
            { created_at: '2026-06-12T00:00:00.000Z' },
          ],
          total: 9,
          nextPage: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [
            { created_at: '2026-05-20T00:00:00.000Z' },
            { created_at: '2026-05-19T23:59:59.000Z' },
          ],
          total: 9,
          nextPage: null,
        },
        error: null,
      })
    const { queries } = setup({
      listUsers,
      counts: {
        projects: { count: 2, error: null }, comments: { count: 3, error: null },
        feedback_shares: { count: 4, error: null }, agent_presence: { count: 5, error: null },
      },
    })

    await expect(getAdminStats(now)).resolves.toEqual({
      accounts: 9, projects: 2, comments: 3, shares: 4, activeAgentPresence: 5,
      signups: { last24Hours: 1, last7Days: 2, last30Days: 3 },
    })
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 })
    expect(queries.get('agent_presence')?.query.gte).toHaveBeenCalledWith(
      'last_seen_at', '2026-06-18T23:59:00.000Z',
    )
  })

  it('falls back when auth total and database counts are null', async () => {
    setup({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ created_at: 'invalid' }], nextPage: null }, error: null,
      }),
      counts: {
        projects: { count: null, error: null },
        agent_presence: { count: null, error: null },
      },
    })
    const result = await getAdminStats(new Date('2026-06-19T00:00:00.000Z'))
    expect(result.accounts).toBe(1)
    expect(result.projects).toBe(0)
    expect(result.activeAgentPresence).toBe(0)
    expect(result.signups.last30Days).toBe(0)
  })

  it('throws auth, table, and presence errors', async () => {
    setup({
      listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: 'auth down' } }),
    })
    await expect(getAdminStats()).rejects.toThrow('auth down')

    setup({
      listUsers: vi.fn().mockResolvedValue({ data: { users: [], nextPage: null }, error: null }),
      counts: { comments: { count: null, error: { message: 'count down' } } },
    })
    await expect(getAdminStats()).rejects.toThrow('count down')

    setup({
      listUsers: vi.fn().mockResolvedValue({ data: { users: [], nextPage: null }, error: null }),
      counts: { agent_presence: { count: null, error: { message: 'presence down' } } },
    })
    await expect(getAdminStats()).rejects.toThrow('presence down')
  })
})
