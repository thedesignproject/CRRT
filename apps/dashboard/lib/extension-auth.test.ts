import { describe, expect, it } from 'vitest'
import { extensionAuthContinuation, extensionAuthRecoveryDestination, parseExtensionAuthRequest, validateExtensionAuthRedirect } from './extension-auth'

const proof = 'a'.repeat(43)
const redirect = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/crrt-auth'

describe('dashboard extension auth contract', () => {
  it('parses the fixed Chrome callback and supported intent', () => {
    const query = new URLSearchParams({ state: proof, code_challenge: proof, redirect_uri: redirect, intent: 'signup' })
    expect(parseExtensionAuthRequest(`?${query}`)).toEqual({
      state: proof, codeChallenge: proof, redirectUri: redirect, intent: 'signup',
    })
    query.set('intent', 'unexpected')
    expect(parseExtensionAuthRequest(`?${query}`)?.intent).toBe('signin')
  })

  it.each([
    ['state', null],
    ['state', 'short'],
    ['code_challenge', 'short'],
    ['redirect_uri', 'https://evil.example/crrt-auth'],
    ['redirect_uri', `${redirect}?next=https://evil.example`],
  ])('rejects an invalid %s', (key, value) => {
    const query = new URLSearchParams({ state: proof, code_challenge: proof, redirect_uri: redirect })
    if (value === null) query.delete(key)
    else query.set(key, value)
    expect(parseExtensionAuthRequest(`?${query}`)).toBeNull()
  })

  it('preserves only the current dashboard path and query for authentication', () => {
    window.history.replaceState({}, '', `/dashboard/extension-auth?state=${proof}`)
    expect(extensionAuthContinuation()).toBe(`/dashboard/extension-auth?state=${proof}`)
  })

  it('accepts only a valid same-origin extension continuation after password recovery', () => {
    const continuation = `/extension-auth?${new URLSearchParams({ state: proof, code_challenge: proof, redirect_uri: redirect })}`
    expect(extensionAuthRecoveryDestination(`?${new URLSearchParams({ continue: continuation })}`, 'https://crrt.ai')).toBe(continuation)
    expect(extensionAuthRecoveryDestination('', 'https://crrt.ai')).toBeNull()
    expect(extensionAuthRecoveryDestination(`?${new URLSearchParams({ continue: 'https://evil.example/extension-auth' })}`, 'https://crrt.ai')).toBeNull()
    expect(extensionAuthRecoveryDestination(`?${new URLSearchParams({ continue: '/dashboard/extension-auth?state=bad' })}`, 'https://crrt.ai')).toBeNull()
    expect(extensionAuthRecoveryDestination('?continue=http://%', 'https://crrt.ai')).toBeNull()
  })

  it('accepts only the exact server callback for the current request', () => {
    const request = { state: proof, codeChallenge: proof, redirectUri: redirect, intent: 'signin' as const }
    const valid = `${redirect}?code=${'c'.repeat(43)}&state=${proof}`
    expect(validateExtensionAuthRedirect(valid, request)).toBe(valid)
    for (const value of [
      'not a url',
      `https://evil.example/crrt-auth?code=${'c'.repeat(43)}&state=${proof}`,
      `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/wrong?code=${'c'.repeat(43)}&state=${proof}`,
      `${valid}#fragment`,
      `${valid}&extra=1`,
      `${redirect}?code=${'c'.repeat(43)}&other=${proof}`,
      `${redirect}?code=short&state=${proof}`,
      `${redirect}?code=${'c'.repeat(43)}&state=${'x'.repeat(43)}`,
    ]) expect(validateExtensionAuthRedirect(value, request)).toBe('')
  })
})
