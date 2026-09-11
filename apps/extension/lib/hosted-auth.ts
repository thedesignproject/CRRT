import type { SupabaseClient } from '@supabase/supabase-js'
import { browser } from 'wxt/browser'
import type { SessionSummary } from './auth'

export type HostedAuthMessage = { type: 'auth:hosted-sign-in'; intent: 'signin' | 'signup' }
export type AuthAttempt = { state: string; verifier: string; redirectUri: string }
type ExchangeResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string }
}

const ATTEMPT_KEY = 'crrt:extension-auth-attempt'
const PROOF_256 = /^[A-Za-z0-9_-]{43}$/

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomProof(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function challengeFor(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

export function dashboardAuthUrl(attempt: AuthAttempt, intent: HostedAuthMessage['intent'], challenge: string): string {
  const dashboard = new URL(import.meta.env.WXT_DASHBOARD_URL)
  if (dashboard.protocol !== 'https:' && dashboard.hostname !== 'localhost' && dashboard.hostname !== '127.0.0.1') {
    throw new Error('CRRT dashboard must use HTTPS')
  }
  dashboard.pathname = `${dashboard.pathname.replace(/\/$/, '')}/extension-auth`
  dashboard.search = new URLSearchParams({
    state: attempt.state,
    code_challenge: challenge,
    redirect_uri: attempt.redirectUri,
    intent,
  }).toString()
  return dashboard.href
}

export function callbackValues(callbackUrl: string, attempt: AuthAttempt) {
  const actual = new URL(callbackUrl)
  const expected = new URL(attempt.redirectUri)
  const keys = [...actual.searchParams.keys()]
  if (
    actual.origin !== expected.origin
    || actual.pathname !== expected.pathname
    || actual.hash
    || keys.length !== 2
    || !keys.includes('code')
    || !keys.includes('state')
  ) throw new Error('Invalid extension sign-in callback')
  const code = actual.searchParams.get('code')!
  const state = actual.searchParams.get('state')!
  if (!PROOF_256.test(code) || state !== attempt.state) throw new Error('Invalid extension sign-in callback')
  return { code, state }
}

export async function exchange(attempt: AuthAttempt, callbackUrl: string): Promise<ExchangeResponse> {
  const response = await fetch(`${import.meta.env.WXT_API_BASE.replace(/\/$/, '')}/v1/extension/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...callbackValues(callbackUrl, attempt), verifier: attempt.verifier, redirectUri: attempt.redirectUri }),
  })
  const body = await response.json().catch(() => null) as ExchangeResponse | { error?: string } | null
  if (!response.ok) throw new Error(body && 'error' in body && body.error ? body.error : 'Could not complete CRRT sign-in')
  if (
    !body
    || !('accessToken' in body)
    || typeof body.accessToken !== 'string'
    || typeof body.refreshToken !== 'string'
    || !body.user
    || typeof body.user.id !== 'string'
    || typeof body.user.email !== 'string'
  ) throw new Error('CRRT returned an invalid extension session')
  return body
}

export async function startHostedSignIn(client: SupabaseClient, intent: HostedAuthMessage['intent']): Promise<SessionSummary> {
  const attempt: AuthAttempt = {
    state: randomProof(),
    verifier: randomProof(),
    redirectUri: browser.identity.getRedirectURL('crrt-auth'),
  }
  const challenge = await challengeFor(attempt.verifier)
  const url = dashboardAuthUrl(attempt, intent, challenge)
  await browser.storage.session.set({ [ATTEMPT_KEY]: attempt })
  try {
    const callbackUrl = await browser.identity.launchWebAuthFlow({ url, interactive: true })
    if (!callbackUrl) throw new Error('CRRT sign-in was cancelled')
    const result = await exchange(attempt, callbackUrl)
    const { data, error } = await client.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken })
    if (error || data.session?.user.id !== result.user.id || data.session.user.email !== result.user.email) {
      throw error ?? new Error('CRRT returned a different account')
    }
    const verified = await client.auth.getUser()
    if (verified.error || verified.data.user?.id !== result.user.id) {
      await client.auth.signOut({ scope: 'local' })
      throw verified.error ?? new Error('Could not verify the CRRT account')
    }
    return { accessToken: data.session.access_token, email: result.user.email }
  } finally {
    await browser.storage.session.remove(ATTEMPT_KEY)
  }
}
