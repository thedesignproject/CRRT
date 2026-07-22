import { afterEach, describe, expect, it, vi } from 'vitest'

import { decryptToken, encryptToken } from './tokens.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('api/_lib/tokens', () => {
  it('round-trips a v1-prefixed token', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', 'current-secret')
    const encrypted = encryptToken('the-token')
    expect(encrypted.startsWith('v1.')).toBe(true)
    expect(decryptToken(encrypted)).toBe('the-token')
  })

  it('still decrypts a legacy unprefixed payload encrypted under the same secret', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', 'current-secret')
    const legacy = encryptToken('legacy-token').slice('v1.'.length) // exact pre-versioning format
    expect(legacy.startsWith('v1.')).toBe(false)
    expect(decryptToken(legacy)).toBe('legacy-token')
  })

  it('throws on a payload encrypted under a different secret (rotation trigger)', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', 'old-secret')
    const encrypted = encryptToken('the-token')
    vi.stubEnv('SHARE_TOKEN_SECRET', 'new-secret')
    expect(() => decryptToken(encrypted)).toThrow()
  })

  it('throws a clear error on malformed payloads', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', 'current-secret')
    expect(() => decryptToken('not-a-token')).toThrow('Invalid encrypted token payload')
    expect(() => decryptToken('v1.also.bad')).toThrow('Invalid encrypted token payload')
  })

  it('fails loudly in production when SHARE_TOKEN_SECRET is unset', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => encryptToken('t')).toThrow('SHARE_TOKEN_SECRET is not set — refusing to handle share tokens in production')
    expect(() => decryptToken('v1.a.b.c')).toThrow('SHARE_TOKEN_SECRET is not set — refusing to handle share tokens in production')
  })

  it('fails loudly when VERCEL_ENV is production even if NODE_ENV is not', () => {
    vi.stubEnv('SHARE_TOKEN_SECRET', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(() => encryptToken('t')).toThrow('SHARE_TOKEN_SECRET is not set')
  })

  it('uses the dev fallback outside production, warning once', async () => {
    vi.resetModules() // fresh module so the warn-once flag starts clean
    vi.stubEnv('SHARE_TOKEN_SECRET', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fresh = await import('./tokens.js')
    const encrypted = fresh.encryptToken('dev-token')
    expect(fresh.decryptToken(encrypted)).toBe('dev-token')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[tokens] SHARE_TOKEN_SECRET is unset — using the development-only fallback secret')
  })
})
