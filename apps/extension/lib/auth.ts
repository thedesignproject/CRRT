import { createClient, type Session, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { browser } from 'wxt/browser'

export type AuthMessage =
  | { type: 'auth:get' }
  | { type: 'auth:sign-in'; email: string; password: string }
  | { type: 'auth:sign-out' }

export type SessionSummary = { accessToken: string; email: string }

const extensionStorage: SupportedStorage = {
  async getItem(key) {
    const values = await browser.storage.local.get(key)
    return typeof values[key] === 'string' ? values[key] : null
  },
  async setItem(key, value) { await browser.storage.local.set({ [key]: value }) },
  async removeItem(key) { await browser.storage.local.remove(key) },
}

function summarize(session: Session | null): SessionSummary | null {
  if (!session?.user.email) return null
  return { accessToken: session.access_token, email: session.user.email }
}

export function createExtensionSupabase() {
  const url = import.meta.env.WXT_SUPABASE_URL
  const key = import.meta.env.WXT_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing extension Supabase configuration')
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: extensionStorage },
  })
}

export function isAuthMessage(value: unknown): value is AuthMessage {
  if (!value || typeof value !== 'object') return false
  return ['auth:get', 'auth:sign-in', 'auth:sign-out'].includes(String((value as { type?: unknown }).type))
}

export async function handleAuthMessage(client: SupabaseClient, message: AuthMessage) {
  if (message.type === 'auth:get') {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    return summarize(data.session)
  }
  if (message.type === 'auth:sign-in') {
    const { data, error } = await client.auth.signInWithPassword({ email: message.email.trim(), password: message.password })
    if (error) throw error
    return summarize(data.session)
  }
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) throw error
  return null
}
