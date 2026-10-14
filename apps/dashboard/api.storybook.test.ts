import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorybookPairing, getStorybookIntegration } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('Storybook integration API', () => {
  it('loads the encoded project connection without caching', async () => {
    const payload = { state: 'not_connected' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStorybookIntegration('/api', 'session', 'project/key')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/project%2Fkey/storybook', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer session' },
    })
  })

  it('creates a short-lived pairing with session authorization', async () => {
    const payload = {
      state: 'waiting',
      command: 'npx @thedesignproject/crrt-storybook connect --code once',
      expiresAt: '2026-10-14T19:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createStorybookPairing('/api', 'session', 'project/key')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/project%2Fkey/storybook/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session' },
    })
  })
})
