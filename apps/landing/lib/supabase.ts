import { createClient } from '@supabase/supabase-js'

declare global {
  var __CRRT_SUPABASE_URL__: string
  var __CRRT_SUPABASE_ANON_KEY__: string
}

const supabaseUrl = globalThis.__CRRT_SUPABASE_URL__
const supabaseAnonKey = globalThis.__CRRT_SUPABASE_ANON_KEY__

// Authentication enhances the public landing, but it must never prevent the
// marketing and pricing UI from rendering in local or self-hosted previews.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
