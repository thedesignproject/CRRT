// Opt-in full App + local Auth/API/database integration. No auth or handoff mocks.
// Start local API with EXTENSION_DEVELOPMENT_IDS=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.
// VITE_API_BASE=http://127.0.0.1:3003/api CRRT_LOCAL_AUTH_ROUTING_TEST=1 bun --env-file=.env.docker.local run test -- apps/dashboard/App.auth-routing.local.test.tsx
import { createHash, randomBytes } from 'node:crypto'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetch as nodeFetch } from 'undici'

const holder = vi.hoisted(() => ({ client: null as SupabaseClient | null }))
vi.mock('./lib/supabase', () => ({ get supabase() { return holder.client } }))
// Notification subscriptions are outside this auth-routing integration.
vi.mock('./components/NotificationBell', () => ({ NotificationBell: () => null }))
import { App } from './App'

const authUrl = 'http://127.0.0.1:54321'
const api = 'http://127.0.0.1:3003/api'
const extensionId = 'a'.repeat(32)
const redirectUri = `https://${extensionId}.chromiumapp.org/crrt-auth`
const origin = 'http://localhost:5173'
const projectKey = 'demo-project'
const opener = { postMessage: vi.fn() }
// These requests represent the backend/test runner or the separate widget /
// extension consumer, not a fetch from the hosted login document.
const consumerFetch = nodeFetch as unknown as typeof fetch
let admin: SupabaseClient
let email: string
let password: string
let userId: string
let state: string
let verifier: string
let widget: string
let extension: string
let originalOrigins: string[]
let createdExtensionClient = false

async function post(path: string, body: unknown, headers: Record<string, string>) {
  return consumerFetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
async function signIn(enteredPassword = password) {
  fireEvent.change(await screen.findByLabelText('email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('password'), { target: { value: enteredPassword } })
  fireEvent.click(screen.getByRole('button', { name: /authenticate/ }))
}
async function verifyDestination(kind: 'dashboard' | 'widget' | 'extension') {
  if (kind === 'dashboard') {
    await waitFor(() => expect(screen.getByRole('heading', { name: /welcome to crrt/ })).toBeInTheDocument(), { timeout: 10000 })
    expect(window.location.pathname).toBe('/')
    const { data } = await holder.client!.auth.getSession()
    const response = await fetch(`${api}/v1/projects`, { headers: { Authorization: `Bearer ${data.session!.access_token}` } })
    expect(response.status).toBe(200)
  } else if (kind === 'widget') {
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled(), { timeout: 10000 })
    const [message, targetOrigin] = opener.postMessage.mock.calls[0]
    expect(targetOrigin).toBe(origin)
    expect(message).toEqual({ type: 'crrt:widget-auth', code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), state })
    expect(screen.getByRole('status')).toHaveTextContent('Connected')
    const exchange = await post('/v1/widget/auth/exchange', { code: message.code, state, verifier, projectKey }, { Origin: origin })
    expect(exchange.status, await exchange.clone().text()).toBe(200)
    expect((await exchange.json()).accessToken).toMatch(/^crrt_widget_/)
    const replay = await post('/v1/widget/auth/exchange', { code: message.code, state, verifier, projectKey }, { Origin: origin })
    expect(replay.status).toBe(400)
  } else {
    await waitFor(() => expect(window.location.href).toContain(redirectUri + '?'), { timeout: 10000 })
    const callback = new URL(window.location.href)
    expect(callback.searchParams.get('state')).toBe(state)
    const body = { code: callback.searchParams.get('code'), state, verifier, redirectUri }
    const headers = { Origin: `chrome-extension://${extensionId}` }
    const exchange = await post('/v1/extension/auth/exchange', body, headers)
    expect(exchange.status, await exchange.clone().text()).toBe(200)
    const session = await exchange.json()
    expect(session.user.id).toBe(userId)
    expect(session.refreshToken).toBeTruthy()
    expect((await admin.auth.getUser(session.accessToken)).data.user?.id).toBe(userId)
    expect((await post('/v1/extension/auth/exchange', body, headers)).status).toBe(400)
  }
  expect(screen.queryByRole('button', { name: /authenticate/ })).not.toBeInTheDocument()
}

describe.skipIf(process.env.CRRT_LOCAL_AUTH_ROUTING_TEST !== '1')('local authenticated routing and continuations', { timeout: 30000 }, () => {
  beforeAll(async () => {
    expect(process.env.SUPABASE_URL).toBe(authUrl)
    expect(import.meta.env.VITE_API_BASE).toBe(api)
    const key = process.env.SUPABASE_SECRET_KEY!
    admin = createClient(authUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      if (headers.get('Authorization') === `Bearer ${key}` && !key.includes('.')) headers.delete('Authorization')
      return consumerFetch(input, { ...init, headers })
    } } })
    const project = await admin.from('projects').select('public_key,allowed_origins').eq('public_key', projectKey).single()
    expect(project.error).toBeNull()
    originalOrigins = project.data!.allowed_origins
    // The legacy demo seed stores URLs; runtime allowlists require hostnames.
    const configured = await admin.from('projects').update({ allowed_origins: [...originalOrigins, 'localhost'] }).eq('public_key', projectKey)
    expect(configured.error).toBeNull()
    const existingClient = await admin.from('extension_auth_clients').select('extension_id').eq('extension_id', extensionId).maybeSingle()
    expect(existingClient.error).toBeNull()
    if (!existingClient.data) {
      const registered = await admin.from('extension_auth_clients').insert({ extension_id: extensionId, redirect_uri: redirectUri })
      expect(registered.error).toBeNull()
      createdExtensionClient = true
    }
  })
  afterAll(async () => {
    if (originalOrigins) {
      const restored = await admin.from('projects').update({ allowed_origins: originalOrigins }).eq('public_key', projectKey)
      expect(restored.error).toBeNull()
    }
    if (createdExtensionClient) expect((await admin.from('extension_auth_clients').delete().eq('extension_id', extensionId)).error).toBeNull()
  })
  afterEach(async () => {
    cleanup()
    window.location.href = 'http://127.0.0.1:5173/'
    if (holder.client) {
      await holder.client.removeAllChannels()
      holder.client.auth.stopAutoRefresh()
    }
    if (userId) {
      await admin.from('widget_auth_sessions').delete().eq('user_id', userId)
      await admin.from('extension_auth_handoffs').delete().eq('user_id', userId)
      const deleted = await admin.auth.admin.deleteUser(userId)
      expect(deleted.error).toBeNull()
    }
  })

  async function start(path: (widget: string, extension: string) => string) {
    email = `routing-e2e-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`
    password = 'Local-routing-test-123!'
    userId = ''
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
    state = randomBytes(32).toString('base64url')
    verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    widget = '/widget-auth?' + new URLSearchParams({ projectKey, origin, state, codeChallenge: challenge })
    extension = '/extension-auth?' + new URLSearchParams({ state, code_challenge: challenge, redirect_uri: redirectUri })
    window.location.href = 'http://127.0.0.1:5173' + path(widget, extension)
    window.localStorage.clear()
    opener.postMessage.mockClear()
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    const storage = new Map<string, string>()
    holder.client = createClient(authUrl, process.env.SUPABASE_KEY!, { auth: {
      storageKey: 'routing-test-' + state, persistSession: true, autoRefreshToken: false,
      storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value) }, removeItem: key => { storage.delete(key) } },
      lock: async (_name, _timeout, fn) => fn(),
    } })
    render(<App />)
  }

  it.each(['dashboard', 'widget', 'extension'] as const)('completes fresh-link request → sign-in → %s, without refreshing', async kind => {
    await start((widgetPath, extensionPath) => '/forgot-password' + (kind === 'dashboard' ? '' : '?continue=' + encodeURIComponent(kind === 'widget' ? widgetPath : extensionPath)))
    fireEvent.change(await screen.findByLabelText('email'), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/ }))
    await screen.findByText(/check your inbox/, {}, { timeout: 10000 })
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/ }))
    await signIn()
    await verifyDestination(kind)
  })

  it.each(['dashboard', 'widget', 'extension'] as const)('supports direct %s sign-in with a failed-password retry', async kind => {
    await start((widgetPath, extensionPath) => kind === 'dashboard' ? '/login' : kind === 'widget' ? widgetPath : extensionPath)
    await signIn('incorrect-password')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials'), { timeout: 10000 })
    await signIn()
    await verifyDestination(kind)
  })

  it('returns from a fresh-reset form directly to dashboard sign-in', async () => {
    await start(() => '/forgot-password')
    fireEvent.click(await screen.findByRole('link', { name: /back to sign in/ }))
    await signIn()
    await verifyDestination('dashboard')
  })
})
