import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  projects: [{
    publicKey: 'project-1',
    slug: 'project-1',
    name: 'Project',
    allowedOrigins: [],
    createdAt: '',
    updatedAt: '',
  }],
  comments: [],
  fn: vi.fn(),
  superadmin: false,
  signedIn: true,
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    session: fixtures.signedIn ? { access_token: 'session-token' } : null,
    user: { id: 'user-1', email: 'ada@example.com' },
    loading: false,
    signOut: fixtures.fn,
  }),
}))
vi.mock('./hooks/useProjects', () => ({
  useProjects: () => ({
    projects: fixtures.projects,
    loading: false,
    error: null,
    claimProject: fixtures.fn,
    checkAvailability: fixtures.fn,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useComments', () => ({
  useComments: () => ({
    comments: fixtures.comments,
    commentsProjectId: 'project-1',
    loading: false,
    error: null,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useAgentSession', () => ({
  useAgentSession: () => ({
    session: null,
    shareState: null,
    events: fixtures.comments,
    error: null,
    copyPrompt: fixtures.fn,
  }),
}))
vi.mock('./hooks/useSuperAdmin', () => ({ useSuperAdmin: () => ({ superadmin: fixtures.superadmin }) }))

vi.mock('./components/CommentDetail', () => ({
  CommentDetail: (props: { apiBase: string; accessToken: string }) => (
    <div data-testid="detail">{props.apiBase}:{props.accessToken}</div>
  ),
}))
vi.mock('./components/Header', () => ({ Header: (props: { onOpenExtensionComments: () => void; onOpenSuperAdmin: () => void; selectedProject: string; extensionCommentsActive: boolean; setSelectedProject: (id: string) => void; onOpenCmd: () => void; toggleTheme: () => void; onOpenCommentActivity: (payload: { projectKey: string; latestCommentId: string }) => void }) => <><button aria-pressed={props.extensionCommentsActive} onClick={props.onOpenExtensionComments}>my comments</button><button aria-pressed={props.selectedProject === 'project-1'} onClick={() => props.setSelectedProject('project-1')}>project</button><button onClick={props.onOpenSuperAdmin}>super admin</button><button onClick={props.onOpenCmd}>search</button><button onClick={props.toggleTheme}>theme</button><button onClick={() => props.onOpenCommentActivity({ projectKey: 'project-1', latestCommentId: 'comment-1' })}>activity</button></> }))
vi.mock('./components/CommentList', () => ({
  CommentList: (props: { toggleBulkSelect: (id: string) => void }) => (
    <button onClick={() => props.toggleBulkSelect('comment-1')}>toggle test comment</button>
  ),
}))
vi.mock('./components/AgentSidebar', () => ({ AgentSidebar: () => null }))
vi.mock('./components/StatusBar', () => ({ StatusBar: (props: { personal: boolean; onShowSidebar: () => void }) => <button onClick={props.onShowSidebar}>{props.personal ? 'personal footer' : 'project footer'}</button> }))
vi.mock('./components/LoginPage', () => ({ LoginPage: () => <div>sign in first</div> }))
vi.mock('./components/ResetPasswordPage', () => ({ ResetPasswordPage: () => null }))
vi.mock('./components/WelcomeScreen', () => ({ WelcomeScreen: (props: { onOpenExtensionComments: () => void }) => <button onClick={props.onOpenExtensionComments}>welcome comments</button> }))
vi.mock('./components/AddProjectPopover', () => ({ AddProjectPopover: () => null }))
vi.mock('./components/ProjectSettings', () => ({ ProjectSettings: () => null }))
vi.mock('./components/SuperAdminPanel', () => ({ SuperAdminPanel: () => null }))
vi.mock('./components/ExtensionCommentsPage', () => ({ ExtensionCommentsPage: () => <div>extension page</div> }))
vi.mock('./components/CommandPalette', () => ({ CommandPalette: () => <div>command palette</div> }))

import { App } from './App'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  fixtures.signedIn = true
  fixtures.projects.splice(0, fixtures.projects.length, { publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' })
  fixtures.superadmin = false
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: vi.fn((key: string) => key === 'dashboard-theme' ? 'dark' : '1'), setItem: vi.fn() } })
})
afterEach(() => window.history.replaceState({}, '', '/'))

describe('<App /> GitHub issue wiring', () => {
  it('opens My Comments directly from the extension link without selecting a project', () => {
    window.history.replaceState({}, '', '/?view=extension-comments')
    render(<App />)
    expect(screen.getByText('extension page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'my comments' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'project' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'project' }))
    expect(screen.getByTestId('detail')).toBeInTheDocument()
  })

  it('retains the My Comments destination through sign-in and bypasses project onboarding', () => {
    fixtures.signedIn = false; fixtures.projects.splice(0)
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    window.history.replaceState({}, '', '/?view=extension-comments')
    const view = render(<App />)
    expect(screen.getByText('sign in first')).toBeInTheDocument()
    fixtures.signedIn = true; view.rerender(<App />)
    expect(screen.getByText('extension page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'welcome comments' })).toBeNull()
  })

  it('passes the authenticated API context to comment actions', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent(
      'https://crrt.ai/api:session-token',
    ))
    fireEvent.click(screen.getByRole('button', { name: 'theme' }))
    expect(document.documentElement).toHaveClass('light')
    fireEvent.click(screen.getByRole('button', { name: 'theme' }))
    expect(document.documentElement).not.toHaveClass('light')
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'my comments' }))
    expect(screen.getByText('extension page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'my comments' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'project' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'personal footer' }))
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.queryByText('command palette')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'project' }))
    expect(screen.getByRole('button', { name: 'project' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'my comments' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('detail')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByText('command palette')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'search' }))
    expect(screen.getByText('command palette')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'my comments' }))
    expect(screen.queryByText('command palette')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'activity' }))
    expect(screen.getByTestId('detail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'my comments' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens extension comments from zero-project onboarding', async () => {
    fixtures.projects.splice(0)
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => key === 'dashboard-theme' ? 'dark' : null)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'welcome comments' }))
    expect(screen.getByText('extension page')).toBeInTheDocument()
  })

  it('keeps the super-admin branch reachable beside extension comments', async () => {
    fixtures.superadmin = true
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'super admin' }))
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument()
  })
})
