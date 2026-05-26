import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server misconfigured: missing Supabase credentials')
  }

  return createClient(supabaseUrl, supabaseKey)
}

/**
 * Service-role client. Bypasses RLS, so use it only for backend writes/reads
 * on RLS-protected tables (currently: `notifications`). Frontend code must
 * never call this. SUPABASE_SERVICE_ROLE_KEY is required.
 */
export function getServiceSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Server misconfigured: missing Supabase credentials')
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

