import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp,
      resetPasswordForEmail: vi.fn(),
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
  window.history.replaceState({}, '', '/signup')
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
