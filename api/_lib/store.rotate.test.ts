import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { rotateShareToken } from './store.js'

type Result = { data: Record<string, unknown> | null; error: { message: string } | null }

function buildSupabase(result: Result) {
  const single = vi.fn(async () => result)
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { client: { from }, from, update, eq }
}

const ROW = {
  id: 'share-1',
  project_id: 'proj',
  scope_type: 'project',
  scope_page_url: null,
  slug: 'sl',
  access_token_hash: 'new-hash',
  access_token_ciphertext: 'new-cipher',
  created_by: 'system',
  expires_at: '2036-01-01T00:00:00Z',
  revoked_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReset()
})

describe('rotateShareToken', () => {
  it('updates the token columns in place and returns the mapped share', async () => {
    const supabase = buildSupabase({ data: ROW, error: null })
    vi.mocked(getServiceSupabase).mockReturnValue(supabase.client as never)

    const share = await rotateShareToken('share-1', {
      accessTokenHash: 'new-hash',
      accessTokenCiphertext: 'new-cipher',
    })

    expect(supabase.from).toHaveBeenCalledWith('feedback_shares')
    expect(supabase.update).toHaveBeenCalledWith({
      access_token_hash: 'new-hash',
      access_token_ciphertext: 'new-cipher',
    })
    expect(supabase.eq).toHaveBeenCalledWith('id', 'share-1')
    expect(share).toMatchObject({
      id: 'share-1',
      projectId: 'proj',
      accessTokenHash: 'new-hash',
      accessTokenCiphertext: 'new-cipher',
    })
  })

  it('throws when the update fails', async () => {
    const supabase = buildSupabase({ data: null, error: { message: 'update failed' } })
    vi.mocked(getServiceSupabase).mockReturnValue(supabase.client as never)

    await expect(rotateShareToken('share-1', {
      accessTokenHash: 'h',
      accessTokenCiphertext: 'c',
    })).rejects.toThrow('update failed')
  })
})
