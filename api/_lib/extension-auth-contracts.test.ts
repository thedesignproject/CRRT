import { describe, expect, it } from 'vitest'
import {
  ExtensionAuthContractError,
  allowedExtensionIds,
  chromeCallbackUrl,
  createProof,
  extensionIdFromOrigin,
  hashProof,
  parseChromeRedirect,
  parseExchangeRequest,
  parseHandoffRequest,
  pkceChallenge,
  requireAllowedExtension,
} from './extension-auth-contracts.js'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const developmentId = 'ponmlkjihgfedcbaponmlkjihgfedcba'
const redirectUri = `https://${extensionId}.chromiumapp.org/crrt-auth`
const proof = 'a'.repeat(43)
const verifier = 'b'.repeat(43)

describe('extension auth contracts', () => {
  it('accepts only the exact Chrome identity callback shape', () => {
    expect(parseChromeRedirect(redirectUri)).toEqual({ extensionId, redirectUri })
    for (const value of [
      null,
      'not a URL',
      `http://${extensionId}.chromiumapp.org/crrt-auth`,
      `https://user@${extensionId}.chromiumapp.org/crrt-auth`,
      `https://user:password@${extensionId}.chromiumapp.org/crrt-auth`,
      `https://${extensionId}.chromiumapp.org:444/crrt-auth`,
      `https://${extensionId}.chromiumapp.org/other`,
      `${redirectUri}?code=attacker`,
      `${redirectUri}#fragment`,
      'https://example.com/crrt-auth',
    ]) expect(() => parseChromeRedirect(value)).toThrowError(ExtensionAuthContractError)
  })

  it('parses strict handoff and exchange proofs', () => {
    expect(parseHandoffRequest({ state: proof, codeChallenge: proof, redirectUri })).toEqual({
      extensionId, redirectUri, state: proof, codeChallenge: proof,
    })
    expect(parseExchangeRequest({ code: proof, state: proof, verifier, redirectUri })).toEqual({
      extensionId, redirectUri, code: proof, state: proof, pkceVerifier: verifier,
      codeChallenge: pkceChallenge(verifier),
    })
    for (const value of [null, [], 'request']) {
      expect(() => parseHandoffRequest(value)).toThrow('Invalid request')
    }
    for (const [input, message] of [
      [{ state: 1, codeChallenge: proof, redirectUri }, 'Invalid state'],
      [{ state: '!', codeChallenge: proof, redirectUri }, 'Invalid state'],
      [{ state: proof, codeChallenge: 'short', redirectUri }, 'Invalid PKCE challenge'],
      [{ code: 'short', state: proof, verifier, redirectUri }, 'Invalid handoff code'],
      [{ code: proof, state: proof, verifier: 1, redirectUri }, 'Invalid PKCE verifier'],
      [{ code: proof, state: proof, verifier: 'x'.repeat(42), redirectUri }, 'Invalid PKCE verifier'],
      [{ code: proof, state: proof, verifier: `${'x'.repeat(42)}!`, redirectUri }, 'Invalid PKCE verifier'],
    ] as const) expect(() => input.code === undefined
      ? parseHandoffRequest(input)
      : parseExchangeRequest(input)).toThrow(message)
  })

  it('uses production and development extension allowlists without implicit overlap', () => {
    expect([...allowedExtensionIds({ EXTENSION_ALLOWED_IDS: ` ${extensionId}, ` })]).toEqual([extensionId])
    expect([...allowedExtensionIds({
      VERCEL_ENV: 'preview', NODE_ENV: 'production',
      EXTENSION_ALLOWED_IDS: extensionId, EXTENSION_DEVELOPMENT_IDS: developmentId,
    })]).toEqual([extensionId, developmentId])
    expect([...allowedExtensionIds({
      VERCEL_ENV: 'production', EXTENSION_ALLOWED_IDS: extensionId, EXTENSION_DEVELOPMENT_IDS: developmentId,
    })]).toEqual([extensionId])
    expect([...allowedExtensionIds({
      NODE_ENV: 'production', EXTENSION_ALLOWED_IDS: extensionId, EXTENSION_DEVELOPMENT_IDS: developmentId,
    })]).toEqual([extensionId])
    expect([...allowedExtensionIds({ NODE_ENV: 'test', EXTENSION_DEVELOPMENT_IDS: developmentId })]).toEqual([developmentId])
    expect(() => allowedExtensionIds({ EXTENSION_ALLOWED_IDS: 'invalid' })).toThrow(/invalid EXTENSION_ALLOWED_IDS/)
    expect(() => allowedExtensionIds({ EXTENSION_DEVELOPMENT_IDS: 'invalid' })).toThrow(/invalid EXTENSION_DEVELOPMENT_IDS/)
    expect(requireAllowedExtension(extensionId, { EXTENSION_ALLOWED_IDS: extensionId })).toBeUndefined()
    expect(() => requireAllowedExtension(extensionId, {})).toThrow('Extension is not allowed')
  })

  it('recognizes exact extension origins and produces bounded opaque proofs', () => {
    expect(extensionIdFromOrigin(`chrome-extension://${extensionId}`)).toBe(extensionId)
    expect(extensionIdFromOrigin(`chrome-extension://${extensionId}/`)).toBeNull()
    expect(extensionIdFromOrigin(42)).toBeNull()
    const generated = createProof()
    expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashProof('proof')).toBe('c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7')
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(chromeCallbackUrl(redirectUri, proof, verifier)).toBe(`${redirectUri}?code=${proof}&state=${verifier}`)
  })
})
