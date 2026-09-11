import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensionAuthHandoff } from './api'

afterEach(() => vi.restoreAllMocks())

describe('extension auth dashboard API', () => {
  it('creates an authenticated one-time handoff', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ redirectUrl: 'https://id.chromiumapp.org/crrt-auth?code=code&state=state' }),
      { status: 201 },
    ))

    await expect(createExtensionAuthHandoff('https://crrt.ai/api/', 'access', {
      state: 'state', codeChallenge: 'challenge', redirectUri: 'https://id.chromiumapp.org/crrt-auth',
    })).resolves.toEqual({ redirectUrl: 'https://id.chromiumapp.org/crrt-auth?code=code&state=state' })
    expect(fetchMock).toHaveBeenCalledWith('https://crrt.ai/api/v1/extension/auth/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer access' },
      body: JSON.stringify({ state: 'state', codeChallenge: 'challenge', redirectUri: 'https://id.chromiumapp.org/crrt-auth' }),
    })
  })

  it('surfaces a failed handoff', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Extension is not allowed', { status: 403 }))
    await expect(createExtensionAuthHandoff('https://crrt.ai/api', 'access', {
      state: 'state', codeChallenge: 'challenge', redirectUri: 'https://id.chromiumapp.org/crrt-auth',
    })).rejects.toThrow('Extension is not allowed')
  })
})
