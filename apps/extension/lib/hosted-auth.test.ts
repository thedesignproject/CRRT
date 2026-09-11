import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({
  identity: { getRedirectURL: vi.fn(), launchWebAuthFlow: vi.fn() },
  storage: { session: { set: vi.fn(), remove: vi.fn() } },
}))
vi.mock('wxt/browser', () => ({ browser }))

import { base64url, callbackValues, challengeFor, dashboardAuthUrl, exchange, randomProof, startHostedSignIn } from './hosted-auth'

const state = 's'.repeat(43)
const verifier = 'v'.repeat(43)
const code = 'c'.repeat(43)
const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${extensionId}.chromiumapp.org/crrt-auth`
const attempt = { state, verifier, redirectUri }

function client(overrides: Record<string, unknown> = {}) {
  return { auth: {
    setSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'access', user: { id: 'user-1', email: 'u@example.com' } } }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WXT_DASHBOARD_URL', 'https://crrt.ai/dashboard/')
  vi.stubEnv('WXT_API_BASE', 'https://crrt.ai/api/')
  browser.identity.getRedirectURL.mockReturnValue(redirectUri)
  browser.storage.session.set.mockResolvedValue(undefined)
  browser.storage.session.remove.mockResolvedValue(undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('hosted extension authentication primitives', () => {
  it('creates base64url proofs and SHA-256 challenges', async () => {
    const bytes = new Uint8Array(32).fill(255)
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((target: Uint8Array) => { target.fill(255); return target }),
      subtle: { digest: vi.fn().mockResolvedValue(bytes.buffer) },
    })
    expect(base64url(bytes)).toBe('_'.repeat(42) + '8')
    expect(randomProof()).toBe('_'.repeat(42) + '8')
    await expect(challengeFor('verifier')).resolves.toBe('_'.repeat(42) + '8')
  })

  it('builds only HTTPS or local dashboard authorization URLs', () => {
    const url = new URL(dashboardAuthUrl(attempt, 'signup', 'p'.repeat(43)))
    expect(url.pathname).toBe('/dashboard/extension-auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state, code_challenge: 'p'.repeat(43), redirect_uri: redirectUri, intent: 'signup',
    })
    vi.stubEnv('WXT_DASHBOARD_URL', 'http://localhost:5173/dashboard/')
    expect(dashboardAuthUrl(attempt, 'signin', state)).toContain('http://localhost:5173/dashboard/extension-auth')
    vi.stubEnv('WXT_DASHBOARD_URL', 'http://127.0.0.1:5173/dashboard/')
    expect(dashboardAuthUrl(attempt, 'signin', state)).toContain('http://127.0.0.1:5173/dashboard/extension-auth')
    vi.stubEnv('WXT_DASHBOARD_URL', 'http://crrt.example/dashboard/')
    expect(() => dashboardAuthUrl(attempt, 'signin', state)).toThrow('must use HTTPS')
  })

  it('accepts only the expected one-time callback', () => {
    expect(callbackValues(`${redirectUri}?code=${code}&state=${state}`, attempt)).toEqual({ code, state })
    for (const callback of [
      `https://evil.example/crrt-auth?code=${code}&state=${state}`,
      `https://${extensionId}.chromiumapp.org/wrong?code=${code}&state=${state}`,
      `${redirectUri}?code=${code}&state=${state}#fragment`,
      `${redirectUri}?code=${code}&state=${state}&extra=1`,
      `${redirectUri}?code=${code}&other=${state}`,
      `${redirectUri}?code=short&state=${state}`,
      `${redirectUri}?code=${code}&state=${'x'.repeat(43)}`,
    ]) expect(() => callbackValues(callback, attempt)).toThrow('Invalid extension sign-in callback')
  })

  it('exchanges the callback without sending tokens in the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1', email: 'u@example.com' },
    }), { status: 200 }))
    await expect(exchange(attempt, `${redirectUri}?code=${code}&state=${state}`)).resolves.toMatchObject({ accessToken: 'access' })
    expect(fetchMock).toHaveBeenCalledWith('https://crrt.ai/api/v1/extension/auth/exchange', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ code, state, verifier, redirectUri }),
    }))
  })

  it('reports server and fallback exchange errors', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Expired' }), { status: 400 }))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
    await expect(exchange(attempt, `${redirectUri}?code=${code}&state=${state}`)).rejects.toThrow('Expired')
    await expect(exchange(attempt, `${redirectUri}?code=${code}&state=${state}`)).rejects.toThrow('Could not complete CRRT sign-in')
  })

  it('rejects malformed successful exchange responses', async () => {
    const values = [
      null,
      {},
      { accessToken: 1, refreshToken: 'refresh', user: { id: 'user', email: 'u@example.com' } },
      { accessToken: 'access', refreshToken: 1, user: { id: 'user', email: 'u@example.com' } },
      { accessToken: 'access', refreshToken: 'refresh' },
      { accessToken: 'access', refreshToken: 'refresh', user: { id: 1, email: 'u@example.com' } },
      { accessToken: 'access', refreshToken: 'refresh', user: { id: 'user', email: 1 } },
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(values.shift()), { status: 200 }))
    for (let index = 0; index < 7; index += 1) {
      await expect(exchange(attempt, `${redirectUri}?code=${code}&state=${state}`)).rejects.toThrow('invalid extension session')
    }
  })
})

describe('hosted extension authentication flow', () => {
  it('completes the browser flow, verifies the user, and clears temporary state', async () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementationOnce((target) => { new Uint8Array(target.buffer).fill(1); return target })
      .mockImplementationOnce((target) => { new Uint8Array(target.buffer).fill(2); return target })
    browser.identity.launchWebAuthFlow.mockImplementation(async ({ url }: { url: string }) => {
      const authorization = new URL(url)
      return `${redirectUri}?code=${code}&state=${authorization.searchParams.get('state')}`
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1', email: 'u@example.com' },
    }), { status: 200 }))
    const auth = client()

    await expect(startHostedSignIn(auth as never, 'signin')).resolves.toEqual({ accessToken: 'access', email: 'u@example.com' })
    expect(browser.identity.launchWebAuthFlow).toHaveBeenCalledWith({ url: expect.stringContaining('/dashboard/extension-auth?'), interactive: true })
    expect(auth.auth.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' })
    expect(auth.auth.getUser).toHaveBeenCalledOnce()
    expect(browser.storage.session.remove).toHaveBeenCalledWith('crrt:extension-auth-attempt')
  })

  it('clears temporary state when the user cancels', async () => {
    browser.identity.launchWebAuthFlow.mockResolvedValue(undefined)
    await expect(startHostedSignIn(client() as never, 'signin')).rejects.toThrow('cancelled')
    expect(browser.storage.session.remove).toHaveBeenCalledWith('crrt:extension-auth-attempt')
  })

  it('rejects a different session returned by Supabase', async () => {
    browser.identity.launchWebAuthFlow.mockImplementation(async ({ url }: { url: string }) => `${redirectUri}?code=${code}&state=${new URL(url).searchParams.get('state')}`)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1', email: 'u@example.com' },
    }), { status: 200 }))
    const auth = client({ setSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'other', email: 'u@example.com' } } }, error: null }) })
    await expect(startHostedSignIn(auth as never, 'signin')).rejects.toThrow('different account')

    const wrongEmail = client({ setSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'other@example.com' } } }, error: null }) })
    await expect(startHostedSignIn(wrongEmail as never, 'signin')).rejects.toThrow('different account')
  })

  it('surfaces session and verification failures and removes an unverified session', async () => {
    browser.identity.launchWebAuthFlow.mockImplementation(async ({ url }: { url: string }) => `${redirectUri}?code=${code}&state=${new URL(url).searchParams.get('state')}`)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1', email: 'u@example.com' },
    }), { status: 200 }))
    const setFailure = client({ setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('session failed') }) })
    await expect(startHostedSignIn(setFailure as never, 'signin')).rejects.toThrow('session failed')

    const verifyFailure = client({ getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'other' } }, error: null }) })
    await expect(startHostedSignIn(verifyFailure as never, 'signin')).rejects.toThrow('Could not verify')
    expect(verifyFailure.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    const verifyError = client({ getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('verify failed') }) })
    await expect(startHostedSignIn(verifyError as never, 'signin')).rejects.toThrow('verify failed')
  })
})
