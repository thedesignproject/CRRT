import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

it('creates the landing auth client from the build-time Supabase configuration', async () => {
  vi.stubGlobal('__CRRT_SUPABASE_URL__', 'https://example.supabase.co')
  vi.stubGlobal('__CRRT_SUPABASE_ANON_KEY__', 'anon-key')

  const { supabase } = await import('./supabase')

  expect(supabase.auth).toBeDefined()
})
