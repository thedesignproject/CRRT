import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorybookPairing, getStorybookIntegration } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('Storybook integration API', () => {
  it('loads the encoded project connections without caching', async () => {
    const payload = { connections: [] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStorybookIntegration('/api', 'session', 'project/key')).resolves.toEqual({ state: 'not_connected' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/storybook/connections?projectKey=project%2Fkey', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer session' },
    })
  })

  it('prefers an active claimed connection over newer abandoned attempts', async () => {
    const payload = {
      connections: [
        { id: 'waiting', project_key: 'demo', created_by: 'owner', expires_at: '2099-01-01T00:00:00.000Z', claimed_at: null, revoked_at: null },
        { id: 'connected', project_key: 'demo', created_by: 'owner', expires_at: '2026-10-15T00:00:00.000Z', claimed_at: '2026-10-15T00:01:00.000Z', revoked_at: null },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))

    await expect(getStorybookIntegration('/api', 'session', 'demo')).resolves.toEqual({
      state: 'connected',
      connectionId: 'connected',
      connectedAt: '2026-10-15T00:01:00.000Z',
    })
  })

  it('maps expired and unrecoverable pairing attempts without exposing a secret', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [
        { id: 'expired', project_key: 'demo', created_by: 'owner', expires_at: '2000-01-01T00:00:00.000Z', claimed_at: null, revoked_at: null },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [
        { id: 'waiting', project_key: 'demo', created_by: 'owner', expires_at: '2099-01-01T00:00:00.000Z', claimed_at: null, revoked_at: null },
      ] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStorybookIntegration('/api', 'session', 'demo')).resolves.toMatchObject({
      state: 'expired',
      connectionId: 'expired',
    })
    await expect(getStorybookIntegration('/api', 'session', 'demo')).resolves.toEqual({
      state: 'not_connected',
      message: 'Generate a fresh command to continue. Pairing codes are never stored by CRRT.',
    })
  })

  it('creates a short-lived pairing with session authorization', async () => {
    const payload = {
      code: 'once',
      expiresAt: '2026-10-14T19:00:00.000Z',
      connectionId: 'connection-1',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createStorybookPairing('/api', 'session', 'project/key')).resolves.toEqual({
      state: 'waiting',
      command: 'npx @thedesignproject/crrt-storybook connect --code once',
      expiresAt: payload.expiresAt,
      connectionId: payload.connectionId,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/storybook/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session' },
      body: JSON.stringify({ projectKey: 'project/key' }),
    })
  })
})
