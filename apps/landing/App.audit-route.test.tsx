import { act, render, screen } from '@testing-library/react'
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
vi.mock('./legal/PrivacyPage', () => ({ PrivacyPage: () => <main>Public privacy policy</main> }))
vi.mock('./legal/SupportPage', () => ({ SupportPage: () => <main>Public support page</main> }))
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

it('routes direct privacy loads without mounting the marketing site', () => {
  window.history.pushState({}, '', '/privacy/')
  render(<App />)
  expect(screen.getByText('Public privacy policy')).toBeInTheDocument()
  expect(screen.queryByText('Landing product audit')).not.toBeInTheDocument()
})

it('routes direct support loads without mounting the marketing site', () => {
  window.history.pushState({}, '', '/support')
  render(<App />)
  expect(screen.getByText('Public support page')).toBeInTheDocument()
  expect(screen.queryByText('Landing product audit')).not.toBeInTheDocument()
})

it('keeps the landing page for non-audit routes', () => {
  window.history.pushState({}, '', '/')
  render(<App />)
  expect(screen.queryByText('Live audit workspace')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Humans give feedback/i })).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Get started' })[0]).toBeInTheDocument()
})

it('keeps an existing session on the landing and offers explicit dashboard navigation', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } } })
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', 'http://localhost:5173')
  expect(screen.getByRole('heading', { name: /Humans give feedback/i })).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()
})

it('preserves older stay links without requiring them', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  window.history.replaceState({}, '', '/?stay=1')
  auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } } })
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Humans give feedback/i })).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()
})

it('updates account navigation without redirecting on auth changes and unsubscribes', () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  const view = render(<App />)
  expect(auth.listener).not.toBeNull()
  act(() => auth.listener?.('SIGNED_IN', { user: { id: 'user-1' } }))
  expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()
  act(() => auth.listener?.('SIGNED_OUT', null))
  expect(screen.getAllByRole('link', { name: 'Get started' })[0]).toHaveAttribute('href', 'http://localhost:5173')
  expect(replace).not.toHaveBeenCalled()
  view.unmount()
  expect(auth.unsubscribe).toHaveBeenCalledOnce()
})
