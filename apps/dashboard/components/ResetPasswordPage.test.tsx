import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthSessionMissingError } from '@supabase/supabase-js'

const auth = vi.hoisted(() => ({ initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))
import { ResetPasswordPage } from './ResetPasswordPage'

let listener: (event: string) => void
const unsubscribe = vi.fn()
const session = { access_token: 'recovery' }
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.resetAllMocks()
  window.history.replaceState({}, '', '/reset-password')
  auth.initialize.mockResolvedValue({ error: null })
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.signOut.mockResolvedValue({ error: null })
  auth.onAuthStateChange.mockImplementation(callback => {
    listener = callback
    return { data: { subscription: { unsubscribe } } }
  })
})
afterEach(() => vi.useRealTimers())

async function fill(password = 'new-password', confirm = password) {
  await waitFor(() => expect(screen.getByLabelText('new password')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('new password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('confirm'), { target: { value: confirm } })
}
function submit() { fireEvent.submit(screen.getByLabelText('new password').closest('form')!) }
async function invalid() {
  expect(await screen.findByRole('heading', { name: 'link has expired' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('request a new link to reset your password.')
  expect(screen.queryByRole('button', { name: /update password/ })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('new password')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('confirm')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /request a new link/ })).toHaveAttribute('href', expect.stringContaining('/forgot-password'))
}

it('keeps submission blocked while a slow URL exchange is pending, then accepts a valid session', async () => {
  let resolve!: (value: { error: null }) => void
  auth.initialize.mockReturnValue(new Promise(r => { resolve = r }))
  render(<ResetPasswordPage />)
  expect(screen.getByText('checking your reset link…')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(1000))
  submit()
  expect(auth.updateUser).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toBeDisabled()
  await act(async () => resolve({ error: null }))
  await fill()
  await act(() => vi.advanceTimersByTimeAsync(16000))
  expect(screen.getByRole('button')).toBeEnabled()
})

it.each(['expired', 'reused', 'malformed', 'bad-pkce'])('blocks %s recovery initialization even with an existing session', async reason => {
  auth.initialize.mockResolvedValue({ error: new Error(reason) })
  render(<ResetPasswordPage />)
  await invalid()
  expect(auth.getSession).not.toHaveBeenCalled()
  expect(auth.updateUser).not.toHaveBeenCalled()
})
it.each(['missing', 'error', 'rejected'])('blocks a %s session', async kind => {
  if (kind === 'rejected') auth.getSession.mockRejectedValue(new Error('offline'))
  else auth.getSession.mockResolvedValue({ data: { session: null }, error: kind === 'error' ? new Error('failed') : null })
  render(<ResetPasswordPage />)
  await invalid()
})
it('offers a fresh link if initialization stalls, but accepts a late successful exchange', async () => {
  let resolve!: (value: { error: null }) => void
  auth.initialize.mockReturnValue(new Promise(r => { resolve = r }))
  render(<ResetPasswordPage />)
  await act(() => vi.advanceTimersByTimeAsync(15000))
  await invalid()
  await act(async () => resolve({ error: null }))
  await fill()
})
it('cleans up while initialization is pending', async () => {
  let resolve!: (value: { error: null }) => void
  auth.initialize.mockReturnValue(new Promise(r => { resolve = r }))
  const view = render(<ResetPasswordPage />)
  view.unmount()
  await act(async () => resolve({ error: null }))
  expect(unsubscribe).toHaveBeenCalledOnce()
})
it('ignores a failed initialization after unmount', async () => {
  let reject!: (reason: Error) => void
  auth.initialize.mockReturnValue(new Promise((_r, r) => { reject = r }))
  const view = render(<ResetPasswordPage />)
  view.unmount()
  await act(async () => reject(new Error('offline')))
})
it('revokes form access when the session signs out', async () => {
  render(<ResetPasswordPage />)
  await fill()
  act(() => listener('TOKEN_REFRESHED'))
  expect(screen.getByRole('button')).toBeEnabled()
  act(() => listener('SIGNED_OUT'))
  await invalid()
})
it.each(['missing', 'error'])('checks for a %s session again at submission', async kind => {
  render(<ResetPasswordPage />)
  await fill()
  auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: kind === 'error' ? new Error('expired') : null })
  submit()
  await invalid()
  expect(auth.updateUser).not.toHaveBeenCalled()
})
it.each([['short', 'short', 'at least 6'], ['new-password', 'different', "don't match"]])('validates password %s', async (password, confirm, message) => {
  render(<ResetPasswordPage />)
  await fill(password, confirm)
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(auth.updateUser).not.toHaveBeenCalled()
})
it.each([new Error('New password should be different from the old password.'), 'unexpected'])('shows update errors and allows retry: %s', async error => {
  auth.updateUser.mockResolvedValueOnce({ error })
  render(<ResetPasswordPage />)
  await fill()
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(error instanceof Error ? error.message : 'Could not update password')
  expect(screen.getByRole('button')).toBeEnabled()
  submit()
  expect(await screen.findByText(/password updated/)).toBeInTheDocument()
})
it('handles a session disappearing during the update request', async () => {
  auth.updateUser.mockResolvedValueOnce({ error: new AuthSessionMissingError() })
  render(<ResetPasswordPage />)
  await fill()
  submit()
  await invalid()
})
it('blocks duplicate submissions while updating', async () => {
  let resolve!: (value: { error: null }) => void
  auth.updateUser.mockReturnValue(new Promise(r => { resolve = r }))
  render(<ResetPasswordPage />)
  await fill()
  submit()
  await waitFor(() => expect(screen.getByText('updating…')).toBeInTheDocument())
  submit()
  expect(auth.updateUser).toHaveBeenCalledOnce()
  await act(async () => resolve({ error: null }))
  expect(await screen.findByText(/password updated/)).toBeInTheDocument()
})
it('preserves safe continuation context and strips arbitrary redirects when requesting a new link', async () => {
  window.history.replaceState({}, '', '/reset-password?accessProject=p&redirect=https://evil.test')
  auth.initialize.mockResolvedValue({ error: new Error('expired') })
  render(<ResetPasswordPage />)
  await invalid()
  expect(screen.getByRole('link', { name: /request a new link/ })).toHaveAttribute('href', '/forgot-password?accessProject=p')
  expect(screen.getByRole('link', { name: /back to sign in/ })).toHaveAttribute('href', '/login?accessProject=p')
})

it.each(['#error=access_denied', '#error_code=otp_expired', '#error_description=expired', '?error=access_denied', '?error_code=otp_expired', '?error_description=expired', '?code=unexchanged', '#type=recovery'])('does not let an existing session mask URL failure %s', async suffix => {
  window.history.replaceState({}, '', '/reset-password' + suffix)
  render(<ResetPasswordPage />)
  await invalid()
})
