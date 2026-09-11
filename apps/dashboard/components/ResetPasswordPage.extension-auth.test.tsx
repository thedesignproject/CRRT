import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))

import { ResetPasswordPage } from './ResetPasswordPage'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'recovery' } } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.signOut.mockResolvedValue({ error: null })
  window.history.replaceState({}, '', '/reset-password')
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('password recovery continuation', () => {
  it('finishes recovery through the safe destination resolver', async () => {
    render(<ResetPasswordPage />)
    const password = screen.getByLabelText('new password')
    const confirm = screen.getByLabelText('confirm')
    await waitFor(() => expect(password).not.toBeDisabled())
    fireEvent.change(password, { target: { value: 'password' } })
    fireEvent.change(confirm, { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/password updated/)).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1400)
    expect(window.location.pathname).toBe('/login')
  })
})
