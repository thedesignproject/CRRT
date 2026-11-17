import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  gate: { planRequired: false, trialAvailable: false },
  comments: [] as Array<Record<string, unknown>>,
  fn: vi.fn(),
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
  useProjects: () => ({ projects: fixtures.projects, loading: false, error: null, claimProject: fixtures.fn, checkAvailability: fixtures.fn, refresh: fixtures.fn }),
}))
vi.mock('./hooks/useComments', () => ({
  useComments: () => ({ comments: fixtures.comments, commentsProjectId: null, loading: false, error: null, refresh: fixtures.fn }),
}))
import { App } from './App'
import { route } from './lib/routes'

let assign: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  fixtures.projects = []
  fixtures.gate = { planRequired: false, trialAvailable: false }
  assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')))
})
afterEach(() => { vi.unstubAllGlobals(); assign.mockRestore() })

it.each([
  [true, 'start free trial to create a project'],
  [false, 'choose a plan to create a project'],
])('sends owners without a plan from the welcome screen to Billing (trial available=%s)', async (trialAvailable, label) => {
  fixtures.gate = { planRequired: true, trialAvailable }
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: `▸ ${label}` }))
  expect(assign).toHaveBeenCalledWith(route('/billing'))
  expect(screen.queryByRole('heading', { name: 'Create a project' })).not.toBeInTheDocument()
})

it('opens the create-project form from the welcome screen when no plan is needed', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: '▸ create your first project' }))
  expect(await screen.findByRole('heading', { name: 'Create a project' })).toBeInTheDocument()
  expect(assign).not.toHaveBeenCalled()
})

it.each([true, false])('routes the sidebar create action by plan (plan required=%s)', async (planRequired) => {
  fixtures.projects = [{ publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' }]
  fixtures.gate = { planRequired, trialAvailable: true }
  render(<App />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
  if (planRequired) {
    expect(assign).toHaveBeenCalledWith(route('/billing'))
    expect(screen.queryByRole('heading', { name: 'Create a project' })).not.toBeInTheDocument()
  } else {
    expect(await screen.findByRole('heading', { name: 'Create a project' })).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  }
})
