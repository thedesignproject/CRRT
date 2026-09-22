import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * New secret keys are opaque strings and must be sent via `apikey` only.
 * Local Supabase CLI still emits a legacy JWT service-role key, which also
 * needs the Bearer header for direct REST calls.
 */
export function getPrivilegedHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: secretKey }
  if (isLegacyJwt(secretKey)) {
    headers.Authorization = `Bearer ${secretKey}`
  }
  return headers
}

function isLegacyJwt(secretKey: string) {
  return /^[^.]+\.[^.]+\.[^.]+$/.test(secretKey)
}

/** Prevent supabase-js from turning an opaque secret key into a Bearer token. */
export function getPrivilegedFetch(secretKey: string): typeof fetch | undefined {
  if (isLegacyJwt(secretKey)) return undefined

  return async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.delete('Authorization')
    return fetch(input, { ...init, headers })
  }
}

export function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server misconfigured: missing Supabase credentials')
  }

  return createClient(supabaseUrl, supabaseKey)
}

/** Public-key auth client for server-side token verification without shared session state. */
export function getNonPersistentSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server misconfigured: missing Supabase credentials')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Secret-key client. Bypasses RLS, so it's the client the backend uses for
 * all table access and storage writes — every public table has RLS enabled
 * with no permissive policy (migration 0004), and the API does its own
 * authorization. Frontend code must never call this.
 * SUPABASE_SECRET_KEY is preferred; SUPABASE_SERVICE_ROLE_KEY remains a
 * compatibility fallback during the key cutover.
 */
export function getServiceSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !secretKey) {
    throw new Error('Server misconfigured: missing Supabase credentials')
  }

  const privilegedFetch = getPrivilegedFetch(secretKey)
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(privilegedFetch ? { global: { fetch: privilegedFetch } } : {}),
  })
}
