import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resetPasswordForEmail, signInWithOtp, signInWithPassword, signUp } = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), signInWithOtp: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword,
      signInWithOtp,
      signUp,
      resetPasswordForEmail,
    },
  },
}))

import { LoginPage } from './LoginPage'

async function submitSignup() {
  const user = userEvent.setup()
  render(<LoginPage />)
  await user.type(screen.getByLabelText('email'), 'person@example.com')
  await user.type(screen.getByLabelText('password'), 'password')
  await user.click(screen.getByRole('button', { name: /create account/i }))
}

beforeEach(() => {
  signUp.mockReset()
  signInWithPassword.mockReset()
  signInWithOtp.mockReset()
  resetPasswordForEmail.mockReset()
  window.history.replaceState({}, '', '/signup')
})

describe('LoginPage invitation continuation', () => {
  it('renders the sign-in form during server rendering', () => {
    vi.stubGlobal('window', undefined)
    expect(renderToString(<LoginPage />)).toContain('welcome back')
    vi.unstubAllGlobals()
  })

  it('continues password sign-in back to the pending invitation', async () => {
    window.history.replaceState({}, '', '/login?invite=project%2Fone&email=guest%40example.com')
    signInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /authenticate/i }))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'guest@example.com', password: 'password' }))
    expect(window.location.search).toBe('?invite=project%2Fone')
  })

  it('prefills the invited email and sends a magic link back to the invitation', async () => {
    window.history.replaceState({}, '', '/login?invite=project%2Fone&email=guest%40example.com')
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage />)
    expect(screen.getByLabelText('email')).toHaveValue('guest@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'email me a sign-in link →' }))
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'guest@example.com',
      options: { emailRedirectTo: 'http://localhost:3000/?invite=project%2Fone' },
    }))
    expect(await screen.findByText(/secure sign-in link/)).toBeInTheDocument()
  })

  it('shows specific and fallback magic-link failures', async () => {
    window.history.replaceState({}, '', '/login')
    signInWithOtp.mockResolvedValueOnce({ error: new Error('email unavailable') })
      .mockRejectedValueOnce('offline')
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'guest@example.com' } })

    fireEvent.click(screen.getByRole('button', { name: 'email me a sign-in link →' }))
    expect(await screen.findByText(/email unavailable/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'email me a sign-in link →' }))
    expect(await screen.findByText(/Could not send sign-in link/)).toBeInTheDocument()
  })

  it('sends regular password recovery back to the dashboard reset route', async () => {
    window.history.replaceState({}, '', '/login')
    resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('link', { name: 'forgot password? →' }))
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'guest@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('guest@example.com', {
      redirectTo: 'http://localhost:3000/reset-password',
    }))
  })
})

describe('LoginPage signup', () => {
  it('offers sign in when Supabase returns an existing-user error', async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already exists' },
    })

    await submitSignup()

    expect(await screen.findByText('account already exists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sign in →' })).toBeInTheDocument()
  })

  it('offers sign in for the legacy already-registered error message', async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })

    await submitSignup()

    expect(await screen.findByText('account already exists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sign in →' })).toBeInTheDocument()
  })

  it('offers sign in when Supabase reports an existing account', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    })

    await submitSignup()

    expect(await screen.findByText('account already exists')).toBeInTheDocument()
    expect(screen.getByText("there's already an account for this email. sign in to continue.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'sign in →' }))
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })

  it('clears the existing-account notice when browser history changes', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    })

    await submitSignup()
    expect(await screen.findByText('account already exists')).toBeInTheDocument()

    window.history.pushState({}, '', '/login')
    fireEvent.popState(window)

    expect(await screen.findByText('welcome back')).toBeInTheDocument()
    expect(screen.queryByText('account already exists')).not.toBeInTheDocument()
  })

  it('shows the confirmation message for a newly created account', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{ id: 'identity-1' }] }, session: null },
      error: null,
    })

    await submitSignup()

    expect(await screen.findByText('✓ check your email')).toBeInTheDocument()
    expect(screen.queryByText('account already exists')).not.toBeInTheDocument()
  })
})

describe('LoginPage extension continuation', () => {
  const continuation = `/extension-auth?${new URLSearchParams({
    state: 's'.repeat(43), code_challenge: 'p'.repeat(43),
    redirect_uri: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/crrt-auth',
  })}`

  it('keeps password and magic-link sign-in in the hosted extension flow', async () => {
    window.history.replaceState({}, '', continuation)
    signInWithPassword.mockResolvedValue({ error: null })
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage continuationPath={continuation} />)
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'u@example.com' } })
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /authenticate/i }))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled())
    expect(window.location.pathname + window.location.search).toBe(continuation)
    fireEvent.click(screen.getByRole('button', { name: 'email me a sign-in link →' }))
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'u@example.com', options: { emailRedirectTo: `http://localhost:3000${continuation}` },
    }))
  })

  it('switches modes without dropping the hosted flow and preserves it through recovery', async () => {
    window.history.replaceState({}, '', continuation)
    resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<LoginPage initialMode="signup" continuationPath={continuation} />)
    expect(screen.getByText('create your crrt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'sign in →' }))
    fireEvent.click(screen.getByRole('link', { name: 'forgot password? →' }))
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'u@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('u@example.com', {
      redirectTo: `http://localhost:3000/reset-password?${new URLSearchParams({ continue: continuation })}`,
    }))
    expect(window.location.pathname + window.location.search).toBe(continuation)
  })
})
