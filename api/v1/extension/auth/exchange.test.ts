import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/extension-auth-store.js', () => ({
  consumeExtensionAuthHandoff: vi.fn(),
  mintExtensionSession: vi.fn(),
}))

import handler from './exchange.js'
import { hashProof, pkceChallenge } from '../../../_lib/extension-auth-contracts.js'
import { consumeExtensionAuthHandoff, mintExtensionSession } from '../../../_lib/extension-auth-store.js'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const otherExtensionId = 'ponmlkjihgfedcbaponmlkjihgfedcba'
const origin = `chrome-extension://${extensionId}`
const redirectUri = `https://${extensionId}.chromiumapp.org/crrt-auth`
const code = 'a'.repeat(43)
const state = 'b'.repeat(43)
const verifier = 'c'.repeat(43)
const originalAllowed = process.env.EXTENSION_ALLOWED_IDS

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(value: number) { this.statusCode = value; return this },
    json(value: unknown) { this.body = value; return this },
    end() { return this },
  }
}
const call = (request: unknown, res: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(request, res)
const request = (overrides: Record<string, unknown> = {}) => ({
  method: 'POST', headers: { origin }, body: { code, state, verifier, redirectUri }, ...overrides,
})

beforeEach(() => {
  process.env.EXTENSION_ALLOWED_IDS = extensionId
  vi.mocked(consumeExtensionAuthHandoff).mockReset().mockResolvedValue('user-1')
  vi.mocked(mintExtensionSession).mockReset().mockResolvedValue({
    accessToken: 'access', refreshToken: 'refresh', expiresAt: 123,
    user: { id: 'user-1', email: 'user@example.com' },
  })
})
afterEach(() => {
  if (originalAllowed === undefined) delete process.env.EXTENSION_ALLOWED_IDS
  else process.env.EXTENSION_ALLOWED_IDS = originalAllowed
})

describe('extension auth exchange endpoint', () => {
  it('allows preflight and methods only for the exact allowlisted extension origin', async () => {
    let res = response()
    await call(request({ method: 'OPTIONS', body: undefined }), res)
    expect(res).toMatchObject({ statusCode: 204 })
    expect(res.headers['Access-Control-Allow-Origin']).toBe(origin)

    res = response()
    await call(request({ method: 'GET' }), res)
    expect(res).toMatchObject({ statusCode: 405, body: { error: 'Method not allowed' } })

    for (const rejectedOrigin of [undefined, 'https://example.com', `chrome-extension://${otherExtensionId}`]) {
      res = response()
      await call(request({ method: 'OPTIONS', headers: { origin: rejectedOrigin } }), res)
      expect(res.statusCode).toBe(403)
      expect(res.headers).not.toHaveProperty('Access-Control-Allow-Origin')
    }

    process.env.EXTENSION_ALLOWED_IDS = 'invalid'
    res = response()
    await call(request({ method: 'OPTIONS' }), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Extension authentication unavailable' } })

    process.env.EXTENSION_ALLOWED_IDS = extensionId
    res = response()
    const originalSetHeader = res.setHeader
    let headerCalls = 0
    res.setHeader = vi.fn(function (this: typeof res, key: string, value: string) {
      headerCalls += 1
      if (headerCalls <= 2) return originalSetHeader.call(this, key, value)
      res.setHeader = originalSetHeader
      throw new Error(`could not set ${key} to ${value}`)
    })
    await call(request({ method: 'OPTIONS' }), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Extension authentication unavailable' } })
  })

  it('consumes the exact proof before minting an isolated session', async () => {
    const res = response()
    await call(request(), res)
    expect(consumeExtensionAuthHandoff).toHaveBeenCalledWith({
      codeHash: hashProof(code), stateHash: hashProof(state), codeChallenge: pkceChallenge(verifier),
      extensionId, redirectUri,
    })
    expect(mintExtensionSession).toHaveBeenCalledWith('user-1')
    expect(vi.mocked(consumeExtensionAuthHandoff).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(mintExtensionSession).mock.invocationCallOrder[0]!,
    )
    expect(res).toMatchObject({
      statusCode: 200,
      body: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'user-1' } },
    })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('rejects redirect/origin mismatches before touching persistence', async () => {
    const res = response()
    await call(request({ body: {
      code, state, verifier,
      redirectUri: `https://${otherExtensionId}.chromiumapp.org/crrt-auth`,
    } }), res)
    expect(res).toMatchObject({ statusCode: 403, body: { error: 'Extension origin does not match redirect' } })
    expect(consumeExtensionAuthHandoff).not.toHaveBeenCalled()
  })

  it('fails closed for malformed, expired, and internal exchange failures', async () => {
    let res = response()
    await call(request({ body: {} }), res)
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'Invalid handoff code' } })

    vi.mocked(consumeExtensionAuthHandoff).mockResolvedValueOnce(null)
    res = response()
    await call(request(), res)
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'Invalid or expired extension sign-in' } })
    expect(mintExtensionSession).not.toHaveBeenCalled()

    vi.mocked(consumeExtensionAuthHandoff).mockRejectedValueOnce(new Error('private database detail'))
    res = response()
    await call(request(), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Unable to complete extension sign-in' } })

    vi.mocked(mintExtensionSession).mockRejectedValueOnce(new Error('private auth detail'))
    res = response()
    await call(request(), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Unable to complete extension sign-in' } })
    expect(JSON.stringify(res.body)).not.toMatch(/private auth|private database/)
  })
})
