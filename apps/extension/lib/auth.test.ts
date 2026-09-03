import { beforeEach, describe, expect, it, vi } from 'vitest'

const { local } = vi.hoisted(() => ({ local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } }))
vi.mock('wxt/browser', () => ({ browser: { storage: { local } } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { createClient } from '@supabase/supabase-js'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from './auth'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WXT_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('WXT_SUPABASE_ANON_KEY', 'anon')
})

describe('extension auth', () => {
  it('creates a persistent Supabase client backed by extension storage', async () => {
    const expected = { auth: {} }
    vi.mocked(createClient).mockReturnValue(expected as never)
    expect(createExtensionSupabase()).toBe(expected)
    const options = vi.mocked(createClient).mock.calls[0]?.[2]
    expect(options?.auth).toMatchObject({ persistSession: true, autoRefreshToken: true, detectSessionInUrl: false })
    const storage = options?.auth?.storage
    local.get.mockResolvedValueOnce({ key: 'value' }).mockResolvedValueOnce({ key: 42 })
    await expect(storage?.getItem('key')).resolves.toBe('value')
    await expect(storage?.getItem('key')).resolves.toBeNull()
    await storage?.setItem('key', 'value'); expect(local.set).toHaveBeenCalledWith({ key: 'value' })
    await storage?.removeItem('key'); expect(local.remove).toHaveBeenCalledWith('key')
  })

  it('rejects either missing Supabase setting', () => {
    vi.stubEnv('WXT_SUPABASE_URL', '')
    expect(() => createExtensionSupabase()).toThrow(/Missing extension/)
    vi.stubEnv('WXT_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('WXT_SUPABASE_ANON_KEY', '')
    expect(() => createExtensionSupabase()).toThrow(/Missing extension/)
  })

  it('recognizes only supported auth messages', () => {
    expect(isAuthMessage({ type: 'auth:get' })).toBe(true)
    expect(isAuthMessage({ type: 'auth:sign-in' })).toBe(true)
    expect(isAuthMessage({ type: 'auth:sign-out' })).toBe(true)
    expect(isAuthMessage({ type: 'other' })).toBe(false)
    expect(isAuthMessage(null)).toBe(false)
    expect(isAuthMessage('auth:get')).toBe(false)
  })

  it('gets, signs in, and signs out while returning safe session summaries', async () => {
    const session = { access_token: 'token', user: { email: 'u@example.com' } }
    const client = { auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    } }
    await expect(handleAuthMessage(client as never, { type: 'auth:get' })).resolves.toEqual({ accessToken: 'token', email: 'u@example.com' })
    await expect(handleAuthMessage(client as never, { type: 'auth:sign-in', email: ' u@example.com ', password: 'pw' })).resolves.toEqual({ accessToken: 'token', email: 'u@example.com' })
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'u@example.com', password: 'pw' })
    await expect(handleAuthMessage(client as never, { type: 'auth:sign-out' })).resolves.toBeNull()
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(handleAuthMessage(client as never, { type: 'auth:get' })).resolves.toBeNull()
    client.auth.getSession.mockResolvedValueOnce({ data: { session: { user: {} } }, error: null })
    await expect(handleAuthMessage(client as never, { type: 'auth:get' })).resolves.toBeNull()
  })

  it('surfaces Supabase auth errors', async () => {
    const failure = { data: { session: null }, error: new Error('auth down') }
    const client = { auth: {
      getSession: vi.fn().mockResolvedValue(failure),
      signInWithPassword: vi.fn().mockResolvedValue(failure),
      signOut: vi.fn().mockResolvedValue({ error: new Error('auth down') }),
    } }
    await expect(handleAuthMessage(client as never, { type: 'auth:get' })).rejects.toThrow('auth down')
    await expect(handleAuthMessage(client as never, { type: 'auth:sign-in', email: 'a', password: 'b' })).rejects.toThrow('auth down')
    await expect(handleAuthMessage(client as never, { type: 'auth:sign-out' })).rejects.toThrow('auth down')
  })
})
