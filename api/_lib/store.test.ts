import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getSupabase: vi.fn() }))

import { getSupabase } from './supabase.js'
import { ensurePublicProject } from './store.js'

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
