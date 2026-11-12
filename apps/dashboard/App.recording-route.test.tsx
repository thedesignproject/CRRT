import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ value: { session: null as null | { access_token: string }, user: null as null | { id: string }, loading: true, signOut: vi.fn() } }))
const data = vi.hoisted(() => ({ projects: [] as any[], comments: [] as any[], refresh: vi.fn(), claim: vi.fn() }))
vi.mock('./hooks/useAuth', () => ({ useAuth: () => auth.value }))
vi.mock('./hooks/useProjects', () => ({ useProjects: () => ({ projects: data.projects, loading: false, error: null, refresh: data.refresh, claimProject: data.claim, checkAvailability: data.refresh }) }))
vi.mock('./hooks/useComments', () => ({ useComments: () => ({ comments: data.comments, loading: false, error: null, refresh: data.refresh }) }))
vi.mock('./hooks/useSuperAdmin', () => ({ useSuperAdmin: () => ({ superadmin: false }) }))
vi.mock('./hooks/useAgentSession', () => ({ useAgentSession: () => ({ session: null, shareState: null, events: [], error: null, copyPrompt: data.refresh, adoptSession: data.refresh }) }))
vi.mock('./components/Header', () => ({ Header: (props: any) => <nav aria-label="Dashboard"><button aria-pressed={props.recordingsActive} onClick={props.onOpenRecordings}>Recordings</button><button onClick={props.onOpenExtensionComments}>Inbox</button><button onClick={() => props.setSelectedProject('project')}>Project</button></nav> }))
vi.mock('./components/RecordingsPage', () => ({ RecordingsPage: () => <h1>Recording library</h1> }))
vi.mock('./components/ExtensionCommentsPage', () => ({ ExtensionCommentsPage: () => <h1>Personal Inbox</h1> }))
vi.mock('./lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('./components/RecordingSharePage', () => ({ RecordingSharePage: ({ ownerToken }: { ownerToken?: string }) => <p>{ownerToken ? `Owner ${ownerToken}` : 'Anonymous recording'}</p> }))
import { App } from './App'
beforeEach(() => { auth.value = { session: null, user: null, loading: true, signOut: vi.fn() }; data.projects = []; localStorage.clear() })
it('opens human share links without waiting for or requiring dashboard authentication', () => {
  history.replaceState(null, '', '/recording#capability')
  render(<App />)
  expect(screen.getByText('Anonymous recording')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Dashboard' })).toBeNull()
})
it('passes the real owner session to private library playback', () => {
  history.replaceState(null, '', '/recording?id=recording-id')
  auth.value = { session: { access_token: 'owner-token' }, user: { id: 'owner' }, loading: false, signOut: vi.fn() }
  render(<App />)
  expect(screen.getByText('Owner owner-token')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recordings' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Recordings' }))
  expect(screen.getByRole('heading', { name: 'Recording library' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  expect(window.location.search).toBe('?view=recordings')
})
it('navigates from private playback into the Inbox without retaining the recording URL', () => {
  history.replaceState(null, '', '/recording?id=recording-id')
  auth.value = { session: { access_token: 'owner-token' }, user: { id: 'owner' }, loading: false, signOut: vi.fn() }
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
  expect(screen.getByRole('heading', { name: 'Personal Inbox' })).toBeInTheDocument()
  expect(window.location.search).toBe('?view=extension-comments')
})
it('leaves private playback for project feedback without a stale recording query', async () => {
  history.replaceState(null, '', '/recording?id=recording-id')
  localStorage.setItem('crrt:dashboard:onboarded', '1')
  data.projects = [{ publicKey: 'project', name: 'Project', capabilities: [] }]
  auth.value = { session: { access_token: 'owner-token' }, user: { id: 'owner' }, loading: false, signOut: vi.fn() }
  const view = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Project' }))
  await waitFor(() => expect(window.location.search).toBe(''))
  view.rerender(<App />)
  expect(screen.queryByText('Owner owner-token')).toBeNull()
  expect(screen.queryByText('Anonymous recording')).toBeNull()
})
