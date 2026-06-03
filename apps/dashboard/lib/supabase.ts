import { createClient } from '@supabase/supabase-js'

// Injected at build time by vite.config.ts via `define` so the env var stays
// unprefixed (no VITE_) and shared with the server-side client.
declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

if (!__SUPABASE_URL__ || !__SUPABASE_ANON_KEY__) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
}

export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
