import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ session: { access_token: 'bearer' }, user: { id: 'user' }, loading: false, signOut: vi.fn() }) }))
vi.mock('./components/ProductAuditPage', () => ({ ProductAuditPage: ({ auditId }: { auditId: string }) => <div>audit route {auditId}</div> }))
vi.mock('./components/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
import { App } from './App'
describe('dashboard audit routing', () => {
  beforeEach(() => window.history.replaceState({}, '', '/audits/11111111-1111-4111-8111-111111111111'))
  it('renders the authenticated base-aware audit route', () => {
    render(<App />)
    expect(screen.getByText('audit route 11111111-1111-4111-8111-111111111111')).toBeInTheDocument()
  })
})
