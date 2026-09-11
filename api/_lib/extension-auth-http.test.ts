import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extensionJsonError, setExtensionCors, setExtensionNoStore } from './extension-auth-http.js'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const originalAllowed = process.env.EXTENSION_ALLOWED_IDS

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

beforeEach(() => { process.env.EXTENSION_ALLOWED_IDS = extensionId })
afterEach(() => {
  if (originalAllowed === undefined) delete process.env.EXTENSION_ALLOWED_IDS
  else process.env.EXTENSION_ALLOWED_IDS = originalAllowed
})

describe('extension auth HTTP boundary', () => {
  it('returns CORS only to the exact allowlisted Chrome extension origin', () => {
    const res = response()
    expect(setExtensionCors({ headers: { origin: `chrome-extension://${extensionId}` } } as never, res as never, ['POST', 'OPTIONS'])).toBe(extensionId)
    expect(res.headers).toMatchObject({
      'Access-Control-Allow-Origin': `chrome-extension://${extensionId}`,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    })
    for (const origin of [undefined, 'https://example.com', `chrome-extension://${extensionId}/`]) {
      expect(() => setExtensionCors({ headers: { origin } } as never, response() as never, ['POST'])).toThrow('Extension origin is not allowed')
    }
    process.env.EXTENSION_ALLOWED_IDS = 'ponmlkjihgfedcbaponmlkjihgfedcba'
    expect(() => setExtensionCors({ headers: { origin: `chrome-extension://${extensionId}` } } as never, response() as never, ['POST'])).toThrow('Extension is not allowed')
  })

  it('sets no-store security headers on success and errors', () => {
    let res = response()
    setExtensionNoStore(res as never)
    expect(res.headers).toMatchObject({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res = response()
    extensionJsonError(res as never, 403, 'Forbidden')
    expect(res).toMatchObject({ statusCode: 403, body: { error: 'Forbidden' } })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})
