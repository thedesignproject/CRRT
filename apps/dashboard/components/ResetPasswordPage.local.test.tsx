// Opt-in integration suite. Uses only Docker Supabase and Mailpit, never cloud credentials.
// CRRT_LOCAL_RESET_TEST=1 bun --env-file=.env.docker.local run test -- apps/dashboard/components/ResetPasswordPage.local.test.tsx
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const holder = vi.hoisted(() => ({ client: null as SupabaseClient | null }))
vi.mock('../lib/supabase', () => ({ get supabase() { return holder.client } }))
import { ResetPasswordPage } from './ResetPasswordPage'

const enabled = process.env.CRRT_LOCAL_RESET_TEST === '1'
const api = 'http://127.0.0.1:54321'
const mail = 'http://127.0.0.1:54324'
const redirectTo = 'http://127.0.0.1:5173/dashboard/reset-password'
const clients: SupabaseClient[] = []
let admin: SupabaseClient
let email: string
let originalPassword = 'Local-reset-original-123!'
let userId: string
function client(flowType: 'implicit' | 'pkce' = 'implicit', storage = new Map<string, string>()) {
  const value = createClient(api, process.env.SUPABASE_KEY!, { auth: {
    flowType, persistSession: true, autoRefreshToken: false, detectSessionInUrl: true,
    storageKey: 'local-reset-test',
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, v) => { storage.set(key, v) }, removeItem: key => { storage.delete(key) } },
    lock: async (_name, _timeout, fn) => fn(),
  } })
  clients.push(value)
  return value
}
async function callback(actionLink: string) {
  const response = await fetch(actionLink, { redirect: 'manual' })
  expect(response.status).toBe(303)
  return response.headers.get('location')!
}
async function recoveryLink() {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
  if (error) throw error
  return data.properties.action_link
}
async function open(url: string, flow: 'implicit' | 'pkce' = 'implicit', storage?: Map<string, string>) {
  window.location.href = url
  holder.client = client(flow, storage)
  render(<ResetPasswordPage />)
}
async function ready() {
  await waitFor(() => expect(screen.getByLabelText('new password')).toBeEnabled(), { timeout: 10000 })
}
async function invalid() {
  await waitFor(() => expect(screen.getByRole('heading', { name: 'link has expired' })).toBeInTheDocument(), { timeout: 10000 })
  expect(screen.queryByLabelText('new password')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /update password/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /request a new link/ })).toBeInTheDocument()
}
async function changePassword(password: string) {
  await ready()
  fireEvent.change(screen.getByLabelText('new password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('confirm'), { target: { value: password } })
  fireEvent.submit(screen.getByLabelText('new password').closest('form')!)
}

describe.skipIf(!enabled)('local Supabase password recovery', () => {
  beforeAll(async () => {
    // Refuse a cloud URL even if a developer accidentally loads the wrong env file.
    expect(process.env.SUPABASE_URL).toBe(api)
    admin = createClient(api, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    email = `reset-e2e-${Date.now()}@example.test`
    const { data, error } = await admin.auth.admin.createUser({ email, password: originalPassword, email_confirm: true })
    if (error) throw error
    userId = data.user.id
  })
  afterAll(async () => { if (userId) await admin.auth.admin.deleteUser(userId) })
  afterEach(async () => {
    cleanup()
    for (const value of clients.splice(0)) {
      value.auth.stopAutoRefresh()
      value.auth.onAuthStateChange(() => {}).data.subscription.unsubscribe()
    }
  })

  it('requests a real recovery email, verifies its link, changes the password and signs in with the new password', async () => {
    window.location.href = redirectTo
    const requester = client()
    const { error } = await requester.auth.resetPasswordForEmail(email, { redirectTo })
    expect(error).toBeNull()
    let messageId = ''
    await waitFor(async () => {
      const inbox = await (await fetch(mail + '/api/v1/messages')).json()
      messageId = inbox.messages.find((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === email))?.ID
      expect(messageId).toBeTruthy()
    }, { timeout: 10000 })
    const message = await (await fetch(mail + '/api/v1/message/' + messageId)).json()
    const actionLink = (message.HTML as string).match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)![1].replace(/&amp;/g, '&')
    await open(await callback(actionLink))
    const newPassword = 'Local-reset-changed-456!'
    await changePassword(newPassword)
    await waitFor(() => expect(screen.getByText(/password updated/)).toBeInTheDocument(), { timeout: 10000 })
    await waitFor(async () => expect((await holder.client!.auth.getSession()).data.session).toBeNull())
    const check = client()
    expect((await check.auth.signInWithPassword({ email, password: originalPassword })).error).not.toBeNull()
    expect((await check.auth.signInWithPassword({ email, password: newPassword })).error).toBeNull()
    originalPassword = newPassword
  })

  it('accepts a recovery link in a different browser/storage context and on reload', async () => {
    const url = await callback(await recoveryLink())
    const storage = new Map<string, string>()
    await open(url, 'implicit', storage)
    await ready()
    expect((await holder.client!.auth.getUser()).data.user?.id).toBe(userId)
    cleanup()
    // The SDK removes the hash after exchange; a reload relies on persisted session.
    await open(redirectTo, 'implicit', storage)
    await ready()
  })

  it('rejects an already consumed link (including a link consumed by an email scanner)', async () => {
    const link = await recoveryLink()
    await callback(link)
    const url = await callback(link)
    expect(url).toContain('error_code=otp_expired')
    await open(url)
    await invalid()
  })

  it('rejects a truly expired token using the Auth service expiry check', async () => {
    const link = await recoveryLink()
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
    try {
      await sql`update auth.users set recovery_sent_at = now() - interval '2 days' where id = ${userId}`
    } finally { await sql.end() }
    const url = await callback(link)
    expect(url).toContain('error_code=otp_expired')
    await open(url)
    await invalid()
  })

  it('rejects an invalid token via the real Auth verification endpoint', async () => {
    const link = new URL(await recoveryLink())
    link.searchParams.set('token', '0'.repeat(64))
    await open(await callback(link.href))
    await invalid()
  })

  it('rejects expired URL errors even with another valid signed-in session', async () => {
    window.location.href = redirectTo
    holder.client = client()
    expect((await holder.client.auth.signInWithPassword({ email, password: originalPassword })).error).toBeNull()
    const storageSession = (await holder.client.auth.getSession()).data.session!
    cleanup()
    const storage = new Map([['local-reset-test', JSON.stringify(storageSession)]])
    await open(redirectTo + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', 'implicit', storage)
    await invalid()
  })

  it.each(['', '#type=recovery', '#access_token=broken&type=recovery', '#access_token=broken&refresh_token=broken&expires_in=3600&token_type=bearer&type=recovery', '?code=invalid-code'])('rejects a missing/stripped/malformed recovery context %s', async suffix => {
    await open(redirectTo + suffix)
    await invalid()
  })

  it('shows same-password rejection from Auth and allows a corrected submission', async () => {
    await open(await callback(await recoveryLink()))
    await changePassword(originalPassword)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/different/), { timeout: 10000 })
    expect(screen.getByRole('button')).toBeEnabled()
    await changePassword('Local-reset-retry-789!')
    await waitFor(() => expect(screen.getByText(/password updated/)).toBeInTheDocument(), { timeout: 10000 })
    originalPassword = 'Local-reset-retry-789!'
  })

  it('handles real PKCE recovery, rejecting a missing verifier and a reused code', async () => {
    // A separate account avoids the per-user recovery-email cooldown.
    const pkceEmail = `pkce-${Date.now()}@example.test`
    const created = await admin.auth.admin.createUser({ email: pkceEmail, password: originalPassword, email_confirm: true })
    if (created.error) throw created.error
    try {
      window.location.href = redirectTo
      const storage = new Map<string, string>()
      const requester = client('pkce', storage)
      expect((await requester.auth.resetPasswordForEmail(pkceEmail, { redirectTo })).error).toBeNull()
      let messageId = ''
      await waitFor(async () => {
        const inbox = await (await fetch(mail + '/api/v1/messages')).json()
        messageId = inbox.messages.find((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === pkceEmail))?.ID
        expect(messageId).toBeTruthy()
      }, { timeout: 10000 })
      const message = await (await fetch(mail + '/api/v1/message/' + messageId)).json()
      const link = (message.HTML as string).match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)![1].replace(/&amp;/g, '&')
      const url = await callback(link)
      expect(url).toContain('code=')
      await open(url, 'pkce')
      await invalid()
      cleanup()
      await open(url, 'pkce', storage)
      await ready()
      await changePassword('Local-pkce-reset-123!')
      await waitFor(() => expect(screen.getByText(/password updated/)).toBeInTheDocument(), { timeout: 10000 })
      cleanup()
      // Restore a verifier so the SDK really attempts the consumed code exchange.
      storage.set('local-reset-test-code-verifier', 'invalid-verifier')
      await open(url, 'pkce', storage)
      await invalid()
    } finally { await admin.auth.admin.deleteUser(created.data.user.id) }
  })

  it('disables the form when the recovery session signs out', async () => {
    await open(await callback(await recoveryLink()))
    await ready()
    await act(async () => { await holder.client!.auth.signOut() })
    await invalid()
  })
})
