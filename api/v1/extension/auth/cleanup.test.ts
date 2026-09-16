import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/extension-auth-store.js', () => ({ cleanupExtensionAuthHandoffs: vi.fn() }))

import handler from './cleanup.js'
import { cleanupExtensionAuthHandoffs } from '../../../_lib/extension-auth-store.js'

const originalSecret = process.env.CRON_SECRET

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

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret'
  vi.mocked(cleanupExtensionAuthHandoffs).mockReset().mockResolvedValue()
})
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

describe('extension auth cleanup endpoint', () => {
  it('accepts only authenticated GET requests', async () => {
    let res = response()
    await call({ method: 'POST', headers: {} }, res)
    expect(res).toMatchObject({ statusCode: 405, body: { error: 'Method not allowed' } })

    delete process.env.CRON_SECRET
    res = response()
    await call({ method: 'GET', headers: {} }, res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Cleanup unavailable' } })

    process.env.CRON_SECRET = 'cron-secret'
    res = response()
    await call({ method: 'GET', headers: { authorization: ['Bearer wrong', 'Bearer cron-secret'] } }, res)
    expect(res).toMatchObject({ statusCode: 401, body: { error: 'Unauthorized' } })
    expect(cleanupExtensionAuthHandoffs).not.toHaveBeenCalled()
  })

  it('cleans expired metadata without returning a body', async () => {
    const res = response()
    await call({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res)
    expect(cleanupExtensionAuthHandoffs).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(204)
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('returns a safe failure when persistence is unavailable', async () => {
    vi.mocked(cleanupExtensionAuthHandoffs).mockRejectedValueOnce(new Error('private database detail'))
    const res = response()
    await call({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Cleanup failed' } })
    expect(JSON.stringify(res.body)).not.toContain('private database detail')
  })
})
