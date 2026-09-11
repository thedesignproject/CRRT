import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generatedCode = 'c'.repeat(43)
vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/extension-auth-contracts.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../_lib/extension-auth-contracts.js')>(),
  createProof: vi.fn(() => generatedCode),
}))
vi.mock('../../../_lib/extension-auth-store.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../_lib/extension-auth-store.js')>(),
  createExtensionAuthHandoff: vi.fn(),
  cleanupExtensionAuthHandoffs: vi.fn(),
}))

import handler from './handoff.js'
import { requireUser } from '../../../_lib/auth.js'
import { hashProof } from '../../../_lib/extension-auth-contracts.js'
import { cleanupExtensionAuthHandoffs, createExtensionAuthHandoff, EXTENSION_HANDOFF_TTL_MS } from '../../../_lib/extension-auth-store.js'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${extensionId}.chromiumapp.org/crrt-auth`
const state = 'a'.repeat(43)
const challenge = 'b'.repeat(43)
const originalAllowed = process.env.EXTENSION_ALLOWED_IDS

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    end() { return this },
  }
}
const call = (request: unknown, res: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(request, res)
const post = (body: unknown, headers: Record<string, unknown> = { authorization: 'Bearer dashboard-token' }) => ({
  method: 'POST', headers, query: {}, body,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'))
  process.env.EXTENSION_ALLOWED_IDS = extensionId
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'user-1', email: 'user@example.com' })
  vi.mocked(createExtensionAuthHandoff).mockReset().mockResolvedValue()
  vi.mocked(cleanupExtensionAuthHandoffs).mockReset().mockResolvedValue()
})
afterEach(() => {
  vi.useRealTimers()
  if (originalAllowed === undefined) delete process.env.EXTENSION_ALLOWED_IDS
  else process.env.EXTENSION_ALLOWED_IDS = originalAllowed
})

describe('extension auth handoff endpoint', () => {
  it('handles preflight, methods, and dashboard authentication', async () => {
    let res = response()
    await call({ method: 'OPTIONS', headers: {}, query: {} }, res)
    expect(res.statusCode).toBe(204)
    expect(res.headers['Cache-Control']).toBe('no-store')

    res = response()
    await call({ method: 'GET', headers: {}, query: {} }, res)
    expect(res.statusCode).toBe(405)

    res = response()
    await call(post({}, {}), res)
    expect(res.statusCode).toBe(401)
    expect(requireUser).not.toHaveBeenCalled()

    res = response()
    await call(post({}, { authorization: 'Basic credentials' }), res)
    expect(res.statusCode).toBe(401)

    vi.mocked(requireUser).mockResolvedValueOnce(null)
    res = response()
    await call(post({}), res)
    expect(createExtensionAuthHandoff).not.toHaveBeenCalled()
  })

  it('creates a five-minute hashed handoff and returns only the Chrome callback', async () => {
    const res = response()
    await call(post({ state, codeChallenge: challenge, redirectUri }), res)
    expect(res).toMatchObject({
      statusCode: 201,
      body: { redirectUrl: `${redirectUri}?code=${generatedCode}&state=${state}` },
    })
    expect(createExtensionAuthHandoff).toHaveBeenCalledWith({
      codeHash: hashProof(generatedCode), stateHash: hashProof(state), codeChallenge: challenge,
      userId: 'user-1', extensionId, redirectUri,
      expiresAt: new Date(Date.now() + EXTENSION_HANDOFF_TTL_MS),
    })
    expect(cleanupExtensionAuthHandoffs).toHaveBeenCalledOnce()
    expect(JSON.stringify(res.body)).not.toContain(hashProof(generatedCode))
  })

  it('does not fail a valid handoff when best-effort cleanup is unavailable', async () => {
    vi.mocked(cleanupExtensionAuthHandoffs).mockRejectedValueOnce(new Error('cleanup down'))
    const res = response()
    await call(post({ state, codeChallenge: challenge, redirectUri }), res)
    expect(res.statusCode).toBe(201)
  })

  it('rejects invalid or unapproved requests and hides persistence failures', async () => {
    let res = response()
    await call(post({}), res)
    expect(res).toMatchObject({ statusCode: 400, body: { error: 'Invalid state' } })

    process.env.EXTENSION_ALLOWED_IDS = 'ponmlkjihgfedcbaponmlkjihgfedcba'
    res = response()
    await call(post({ state, codeChallenge: challenge, redirectUri }), res)
    expect(res).toMatchObject({ statusCode: 403, body: { error: 'Extension is not allowed' } })

    process.env.EXTENSION_ALLOWED_IDS = extensionId
    vi.mocked(createExtensionAuthHandoff).mockRejectedValueOnce(new Error('private database detail'))
    res = response()
    await call(post({ state, codeChallenge: challenge, redirectUri }), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Unable to create extension sign-in' } })
    expect(JSON.stringify(res.body)).not.toContain('private database detail')
  })
})
