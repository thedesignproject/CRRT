import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  unsubscribe: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
      },
    },
  },
}))
vi.mock('./product-audit/ProductAuditWorkspace', () => ({ ProductAuditWorkspace: () => <div>Live audit workspace</div> }))
vi.mock('./sections/ProductAudit', () => ({ ProductAudit: () => <section>Landing product audit</section> }))
vi.mock('@widget/components/FeedbackWidget', () => ({ FeedbackWidget: () => null }))
import { App } from './App'

beforeEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null } })
  auth.listener = null
  auth.unsubscribe.mockReset()
})

afterEach(() => window.history.replaceState({}, '', '/'))

it('routes durable audit IDs to the live workspace', () => {
  window.history.pushState({}, '', '/audit/11111111-1111-4111-8111-111111111111')
  render(<App />)
  expect(screen.getByText('Live audit workspace')).toBeInTheDocument()
})

it('keeps the landing page for non-audit routes', () => {
  window.history.pushState({}, '', '/')
  render(<App />)
  expect(screen.queryByText('Live audit workspace')).not.toBeInTheDocument()
  expect(screen.getByText('Landing product audit')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign up →' })).toBeInTheDocument()
})

it('recognizes an existing session, updates the nav, and redirects to the dashboard', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } } })
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Dashboard →' })).toBeInTheDocument()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('http://localhost:5173'))
})

it('keeps the promo page visible for a signed-in user who opts to stay', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  window.history.replaceState({}, '', '/?stay=1')
  auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } } })
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Dashboard →' })).toBeInTheDocument()
  expect(screen.getByText('Landing product audit')).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()
})

it('reacts to later auth changes and unsubscribes on unmount', () => {
  const view = render(<App />)
  expect(auth.listener).not.toBeNull()
  act(() => auth.listener?.('SIGNED_IN', { user: { id: 'user-1' } }))
  expect(screen.getByRole('button', { name: 'Dashboard →' })).toBeInTheDocument()
  view.unmount()
  expect(auth.unsubscribe).toHaveBeenCalledOnce()
})
