import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() }))
vi.mock('./components/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./lib/supabase', () => ({ supabase: { auth } }))
import { App } from './App'

let onAuth: (event: string, session: unknown) => void
const session = { access_token: 'signed-in', user: { id: 'user', email: 'routing@example.test' } }
const opener = { postMessage: vi.fn() }
const state = 'a'.repeat(43)
const redirect = 'https://' + 'a'.repeat(32) + '.chromiumapp.org/crrt-auth'
const widget = '/widget-auth?' + new URLSearchParams({ projectKey: 'p', origin: 'https://site.test', state, codeChallenge: state })
const extension = '/extension-auth?' + new URLSearchParams({ state, code_challenge: state, redirect_uri: redirect })

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  Object.defineProperty(window, 'opener', { configurable: true, value: opener })
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockImplementation(callback => {
    onAuth = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  auth.signInWithPassword.mockImplementation(async () => {
    // Match Supabase: the auth event arrives before signInWithPassword resolves.
    onAuth('SIGNED_IN', session)
    return { data: { session }, error: null }
  })
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    let body: unknown = []
    if (input.endsWith('/admin/me')) body = { isSuperAdmin: false }
    if (input.endsWith('/widget/auth/handoff')) body = { code: state, state }
    if (input.endsWith('/extension/auth/handoff')) body = { redirectUrl: redirect + '?' + new URLSearchParams({ code: state, state }) }
    return new Response(JSON.stringify(body))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function signIn() {
  const email = await screen.findByLabelText('email')
  fireEvent.change(email, { target: { value: 'routing@example.test' } })
  fireEvent.change(screen.getByLabelText('password'), { target: { value: 'test-password' } })
  fireEvent.click(screen.getByRole('button', { name: /authenticate/ }))
}

it.each([false, true])('leaves the fresh-reset route after sign-in without refreshing (request sent=%s)', async sent => {
  window.history.replaceState({}, '', '/forgot-password')
  render(<App />)
  if (sent) {
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'routing@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/ }))
    await screen.findByText(/check your inbox/)
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/ }))
  } else fireEvent.click(screen.getByRole('link', { name: /back to sign in/ }))
  await signIn()
  expect(await screen.findByRole('heading', { name: /welcome to crrt/ })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  expect(screen.queryByRole('button', { name: /authenticate/ })).not.toBeInTheDocument()
})

it.each([widget, extension])('renders the authenticated continuation after fresh-reset sign-in: %s', async continuation => {
  window.history.replaceState({}, '', '/forgot-password?continue=' + encodeURIComponent(continuation))
  render(<App />)
  fireEvent.click(screen.getByRole('link', { name: /back to sign in/ }))
  await signIn()
  if (continuation === widget) {
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalledWith({ type: 'crrt:widget-auth', code: state, state }, 'https://site.test'))
    expect(screen.getByRole('status')).toHaveTextContent('Connected')
  } else {
    await waitFor(() => expect(window.location.href).toContain(redirect + '?'))
    expect(new URL(window.location.href).searchParams.get('state')).toBe(state)
  }
  expect(screen.queryByRole('button', { name: /authenticate/ })).not.toBeInTheDocument()
})

it('keeps failed sign-in on the form and navigates on successful retry', async () => {
  auth.signInWithPassword.mockResolvedValueOnce({ error: new Error('Invalid login credentials') })
  window.history.replaceState({}, '', '/forgot-password')
  render(<App />)
  fireEvent.click(screen.getByRole('link', { name: /back to sign in/ }))
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  expect(window.location.pathname).toBe('/login')
  await signIn()
  expect(await screen.findByRole('heading', { name: /welcome to crrt/ })).toBeInTheDocument()
})
