import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ session: { access_token: 'bearer' }, user: { id: 'user', email: 'owner@example.com' }, loading: false, signOut: vi.fn() }) }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
import { App } from './App'
import { route } from './lib/routes'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })
it('renders account billing directly without loading projects', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) })
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState({}, '', route('/billing'))
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Billing' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', route('/'))
  expect(screen.getByText('owner@example.com')).toBeInTheDocument()
  expect(await screen.findByText('Billing is not enabled in this environment.')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/billing$/)
})
