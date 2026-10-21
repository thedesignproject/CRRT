import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ session: { access_token: 'bearer' }, user: { id: 'user', email: 'owner@example.com' }, loading: false, signOut: vi.fn() }) }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
import { App } from './App'
import { route } from './lib/routes'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })
it('renders account billing directly without loading projects', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ enabled: false }) })
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState({}, '', route('/billing'))
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Billing & usage' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Workspace/ })).toHaveAttribute('href', route('/'))
  expect(screen.getByText('owner@example.com')).toBeInTheDocument()
  expect(await screen.findByText(/Cloud billing is not enabled/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/billing$/)
})

it('routes a signed pricing continuation straight to the Billing Center', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ enabled: false }) }))
  window.history.replaceState({}, '', `${route('/')}?billingState=payload.signature`)
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Billing & usage' })).toBeInTheDocument()
})

it('opens Billing Center with the plan selected before authentication', async () => {
  const plans = ['pro', 'studio'].map((key) => ({
    key, name: key === 'pro' ? 'Pro' : 'Studio', hosting: 'cloud', monthlyPriceUsd: 19, trialDays: 14,
    limits: { projects: 10, internalUsers: 10, commentsPerMonth: 2000, auditsPerMonth: 5, guests: null },
  }))
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ enabled: true, plans }) })
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState({}, '', `${route('/')}?billingPlan=studio`)
  render(<App />)
  expect(await screen.findByRole('button', { name: /Studio/ })).toHaveAttribute('aria-pressed', 'true')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/billing$/)
})
