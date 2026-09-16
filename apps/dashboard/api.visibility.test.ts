import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateCommentVisibility } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('updateCommentVisibility', () => {
  it('sends an authenticated editable audience change', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'c/1', visibility: 'internal' }),
    })
    vi.stubGlobal('fetch', fetch)

    await expect(updateCommentVisibility('/api', 'session', 'c/1', 'internal'))
      .resolves.toMatchObject({ visibility: 'internal' })
    expect(fetch).toHaveBeenCalledWith('/api/v1/comments/c%2F1/visibility', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ visibility: 'internal' }),
      headers: expect.objectContaining({ Authorization: 'Bearer session' }),
    }))
  })
})
