import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ session: null as null | { access_token: string }, user: null as null | { id: string }, loading: false, signOut: vi.fn() }))
vi.mock('./hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('./components/ExtensionAuthPage', () => ({ ExtensionAuthPage: ({ accessToken }: { accessToken: string | null }) => <div>extension auth {accessToken ?? 'anonymous'}</div> }))
vi.mock('./components/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))

import { App } from './App'

describe('dashboard extension auth routing', () => {
  beforeEach(() => {
    auth.session = null; auth.user = null; auth.loading = false
    window.history.replaceState({}, '', '/extension-auth')
  })

  it('renders the hosted route before requiring a dashboard session', () => {
    render(<App />)
    expect(screen.getByText('extension auth anonymous')).toBeInTheDocument()
  })

  it('passes the existing dashboard access token to the hosted route', () => {
    auth.session = { access_token: 'access' }; auth.user = { id: 'user' }
    render(<App />)
    expect(screen.getByText('extension auth access')).toBeInTheDocument()
  })
})
