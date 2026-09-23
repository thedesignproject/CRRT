import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { createClient } from '@supabase/supabase-js'
import {
  getNonPersistentSupabase,
  getPrivilegedFetch,
  getPrivilegedHeaders,
  getServiceSupabase,
  getSupabase,
} from './supabase.js'

beforeEach(() => {
  vi.mocked(createClient).mockClear()
  vi.stubEnv('SUPABASE_URL', 'https://supa.example')
  vi.stubEnv('SUPABASE_KEY', 'anon-key')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getSupabase', () => {
  it('builds an anon-key client', () => {
    getSupabase()
    expect(createClient).toHaveBeenCalledWith('https://supa.example', 'anon-key')
  })

  it('throws when SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL
    expect(() => getSupabase()).toThrow(/missing Supabase credentials/)
  })

  it('throws when SUPABASE_KEY is missing', () => {
    delete process.env.SUPABASE_KEY
    expect(() => getSupabase()).toThrow(/missing Supabase credentials/)
  })
})

describe('getPrivilegedHeaders', () => {
  it('sends new secret keys through apikey only', () => {
    expect(getPrivilegedHeaders('sb_secret_test')).toEqual({ apikey: 'sb_secret_test' })
  })

  it('keeps local legacy JWT compatibility for direct REST calls', () => {
    const jwt = 'header.payload.signature'
    expect(getPrivilegedHeaders(jwt)).toEqual({ apikey: jwt, Authorization: `Bearer ${jwt}` })
  })
})

describe('getPrivilegedFetch', () => {
  it('removes supabase-js Bearer auth for opaque secret keys', async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_test')
      expect(new Headers(init?.headers).get('Authorization')).toBeNull()
      return new Response('ok')
    })
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const privilegedFetch = getPrivilegedFetch('sb_secret_test')
      await privilegedFetch?.('https://supa.example/rest/v1/projects', {
        headers: {
          apikey: 'sb_secret_test',
          Authorization: 'Bearer sb_secret_test',
        },
      })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves Request headers and explicit user JWTs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const privilegedFetch = getPrivilegedFetch('sb_secret_test')!
    const request = new Request('https://supa.example/auth/v1/user', {
      headers: { apikey: 'sb_secret_test', Authorization: 'Bearer sb_secret_test', 'x-test': 'keep' },
    })
    await privilegedFetch(request)
    let headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('apikey')).toBe('sb_secret_test')
    expect(headers.get('x-test')).toBe('keep')
    expect(headers.has('Authorization')).toBe(false)
    expect(request.headers.get('Authorization')).toBe('Bearer sb_secret_test')

    await privilegedFetch(request, { headers: { Authorization: 'Bearer user.jwt.signature' } })
    headers = fetchMock.mock.calls[1][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer user.jwt.signature')
    expect(headers.has('x-test')).toBe(false)

    await privilegedFetch('https://supa.example/auth/v1/health')
    expect([...fetchMock.mock.calls[2][1].headers]).toEqual([])
    await privilegedFetch('https://supa.example/auth/v1/health', {})
    expect([...fetchMock.mock.calls[3][1].headers]).toEqual([])
  })

  it('leaves legacy JWT clients on supabase-js default fetch', () => {
    expect(getPrivilegedFetch('header.payload.signature')).toBeUndefined()
  })
})

describe('getServiceSupabase', () => {
  it('builds a secret-key client with persistSession disabled', () => {
    getServiceSupabase()
    expect(createClient).toHaveBeenCalledWith('https://supa.example', 'sb_secret_test', expect.objectContaining({
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: expect.any(Function) },
    }))
  })

  it('falls back to the legacy service-role variable during cutover', () => {
    delete process.env.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'header.payload.signature'

    getServiceSupabase()

    expect(createClient).toHaveBeenCalledWith(
      'https://supa.example',
      'header.payload.signature',
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  })

  it('uses the legacy key when the new variable is empty, and prefers a configured new key', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'header.payload.signature'
    getServiceSupabase()
    expect(createClient).toHaveBeenLastCalledWith('https://supa.example', 'sb_secret_test', expect.any(Object))
    process.env.SUPABASE_SECRET_KEY = ''
    getServiceSupabase()
    expect(createClient).toHaveBeenLastCalledWith('https://supa.example', 'header.payload.signature', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  it('throws when both privileged key variables are missing', () => {
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => getServiceSupabase()).toThrow(/missing Supabase credentials/)
  })

  it('throws when SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL
    expect(() => getServiceSupabase()).toThrow(/missing Supabase credentials/)
  })
})

describe('getNonPersistentSupabase', () => {
  it('builds an isolated anon-key auth client', () => {
    getNonPersistentSupabase()
    expect(createClient).toHaveBeenCalledWith(
      'https://supa.example',
      'anon-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
  })

  it('requires both public Supabase settings', () => {
    delete process.env.SUPABASE_URL
    expect(() => getNonPersistentSupabase()).toThrow(/missing Supabase credentials/)
    process.env.SUPABASE_URL = 'https://supa.example'
    delete process.env.SUPABASE_KEY
    expect(() => getNonPersistentSupabase()).toThrow(/missing Supabase credentials/)
  })
})
