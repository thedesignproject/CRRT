import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  gate: { planRequired: false, trialAvailable: false },
  comments: [] as Array<Record<string, unknown>>,
  fn: vi.fn(),
  check: vi.fn(),
  claim: vi.fn(),
}))
vi.mock('../posthog', () => ({ default: { capture: vi.fn(), logger: { info: vi.fn() } } }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
vi.mock('./components/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./components/TrialOffer', () => ({ TrialOffer: () => null }))
vi.mock('./hooks/useProjectGate', () => ({ useProjectGate: () => fixtures.gate }))
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ session: { access_token: 'session-token' }, user: { id: 'user-1', email: 'ada@example.com' }, loading: false, signOut: fixtures.fn }),
}))
vi.mock('./hooks/useProjects', () => ({
  useProjects: () => ({ projects: fixtures.projects, loading: false, error: null, claimProject: fixtures.claim, checkAvailability: fixtures.check, refresh: fixtures.fn }),
}))
vi.mock('./components/ProjectSettings', () => ({
  ProjectSettings: ({ onDeleted }: { onDeleted: () => Promise<void> }) => <button onClick={() => { void onDeleted() }}>Confirm delete</button>,
}))
vi.mock('./hooks/useComments', () => ({
  useComments: () => ({ comments: fixtures.comments, commentsProjectId: null, loading: false, error: null, refresh: fixtures.fn }),
}))
import { App } from './App'
import { landingRoute, route } from './lib/routes'

let assign: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  fixtures.projects = []
  fixtures.gate = { planRequired: false, trialAvailable: false }
  fixtures.check.mockReset().mockResolvedValue({ key: '', available: false, suggestion: '' })
  fixtures.claim.mockReset()
  assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')))
})
afterEach(() => { vi.unstubAllGlobals(); assign.mockRestore() })

it.each([
  [true, 'Start free trial'],
  [false, 'Subscribe to Pro'],
])('sends owners without a plan from the first project page to Billing (trial available=%s)', async (trialAvailable, label) => {
  fixtures.gate = { planRequired: true, trialAvailable }
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Create your first project' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', route('/billing'))
  expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Install it yourself' })).toHaveAttribute('href', landingRoute('/docs/self-host'))
})

it('creates the first project when its prompt is copied', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  fixtures.check.mockResolvedValue({ key: 'acme', available: true, suggestion: '' })
  fixtures.claim.mockResolvedValue({ publicKey: 'acme' })
  render(<App />)
  fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Acme' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeEnabled(), { timeout: 2000 })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' })))
  expect(fixtures.claim).toHaveBeenCalledWith('acme', 'Acme')
  expect(await screen.findByText(/Waiting for the first pin on/)).toBeInTheDocument()
  expect(assign).not.toHaveBeenCalled()
})

it('refreshes the list and opens onboarding after the last project is deleted', async () => {
  fixtures.projects = [{ publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' }]
  fixtures.fn.mockImplementation(async () => { fixtures.projects = [] })
  render(<App />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' })))
  expect(fixtures.fn).toHaveBeenCalled()
  expect(await screen.findByRole('heading', { name: 'Create your first project' })).toBeInTheDocument()
  fixtures.fn.mockReset()
})

it.each([true, false])('routes the sidebar create action by plan (plan required=%s)', async (planRequired) => {
  fixtures.projects = [{ publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' }]
  fixtures.gate = { planRequired, trialAvailable: true }
  render(<App />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'New project' }))
  if (planRequired) {
    expect(assign).toHaveBeenCalledWith(route('/billing'))
    expect(screen.queryByRole('heading', { name: 'New project' })).not.toBeInTheDocument()
  } else {
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    expect(screen.queryByRole('heading', { name: 'New project' })).not.toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  }
})
