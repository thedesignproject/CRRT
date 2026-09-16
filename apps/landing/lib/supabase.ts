import { createClient } from '@supabase/supabase-js'

declare global {
  var __CRRT_SUPABASE_URL__: string
  var __CRRT_SUPABASE_ANON_KEY__: string
}

export const supabase = createClient(
  globalThis.__CRRT_SUPABASE_URL__,
  globalThis.__CRRT_SUPABASE_ANON_KEY__,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
