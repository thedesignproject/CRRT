import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  projects: [{
    publicKey: 'project-1',
    slug: 'project-1',
    name: 'Project',
    allowedOrigins: [],
    createdAt: '',
    updatedAt: '',
  }] as Array<Record<string, unknown>>,
  comments: [] as Array<Record<string, unknown>>,
  acceptInvite: vi.fn(),
  updateImpl: vi.fn(),
  updateReview: vi.fn(),
  agentProject: vi.fn(),
  updateVisibility: vi.fn(),
  fn: vi.fn(),
  superadmin: false,
  signedIn: true,
}))

vi.mock('./api', () => ({
  acceptInvite: fixtures.acceptInvite,
  updateImplementationStatus: fixtures.updateImpl,
  updateReviewStatus: fixtures.updateReview,
  updateCommentVisibility: fixtures.updateVisibility,
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
  useAgentSession: (_apiBase: string, project: string | null) => {
    fixtures.agentProject(project)
    return ({
    session: null,
    shareState: null,
    events: fixtures.comments,
    error: null,
    copyPrompt: fixtures.fn,
    })
  },
}))
vi.mock('./hooks/useSuperAdmin', () => ({ useSuperAdmin: () => ({ superadmin: fixtures.superadmin }) }))

vi.mock('./components/CommentDetail', () => ({
  CommentDetail: (props: {
    apiBase: string
    accessToken: string
    selectedComment?: { id: string; visibility?: 'shared' | 'internal' } | null
    onVisibilityChange?: (id: string, visibility: 'shared' | 'internal') => void
  }) => <div data-testid="detail">
    {props.apiBase}:{props.accessToken}:{props.selectedComment?.visibility ?? 'none'}
    {props.selectedComment && <button onClick={() => props.onVisibilityChange?.(
      props.selectedComment!.id,
      props.selectedComment!.visibility === 'internal' ? 'shared' : 'internal',
    )}>change audience</button>}
    <button onClick={() => props.onVisibilityChange?.('missing-comment', 'internal')}>change missing audience</button>
  </div>,
}))
vi.mock('./components/Header', () => ({ Header: (props: { onOpenExtensionComments: () => void; onOpenSuperAdmin: () => void; selectedProject: string; extensionCommentsActive: boolean; setSelectedProject: (id: string) => void; onOpenCmd: () => void; toggleTheme: () => void; onOpenCommentActivity: (payload: { projectKey: string; latestCommentId: string }) => void }) => <><button aria-pressed={props.extensionCommentsActive} onClick={props.onOpenExtensionComments}>my comments</button><button aria-pressed={props.selectedProject === 'project-1'} onClick={() => props.setSelectedProject('project-1')}>project</button><button onClick={props.onOpenSuperAdmin}>super admin</button><button onClick={props.onOpenCmd}>search</button><button onClick={props.toggleTheme}>theme</button><button onClick={() => props.onOpenCommentActivity({ projectKey: 'project-1', latestCommentId: 'comment-1' })}>activity</button></> }))
vi.mock('./components/CommentList', () => ({
  CommentList: (props: { toggleBulkSelect: (id: string) => void; setSelectedCommentId: (id: string) => void }) => <>
    <button onClick={() => props.toggleBulkSelect('comment-1')}>toggle test comment</button>
    <button onClick={() => props.setSelectedCommentId('comment-1')}>select test comment</button>
  </>,
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
vi.mock('./components/CommandPalette', () => ({ CommandPalette: (props: { onAction: (action: string) => void }) => <div>
  command palette
  <button onClick={() => props.onAction('accept')}>command accept</button>
  <button onClick={() => props.onAction('reject')}>command reject</button>
  <button onClick={() => props.onAction('done')}>command done</button>
</div> }))

import { App } from './App'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  fixtures.signedIn = true
  fixtures.acceptInvite.mockReset().mockResolvedValue(undefined)
  fixtures.updateImpl.mockReset().mockResolvedValue(undefined)
  fixtures.updateReview.mockReset().mockResolvedValue(undefined)
  fixtures.agentProject.mockReset()
  fixtures.updateVisibility.mockReset().mockResolvedValue(undefined)
  fixtures.comments.splice(0)
  fixtures.projects.splice(0, fixtures.projects.length, { publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' })
  fixtures.superadmin = false
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: vi.fn((key: string) => key === 'dashboard-theme' ? 'dark' : '1'), setItem: vi.fn() } })
})
afterEach(() => window.history.replaceState({}, '', '/'))

describe('<App /> GitHub issue wiring', () => {
  it('accepts a pending invitation and removes its continuation parameters', async () => {
    window.history.replaceState({}, '', '/?invite=project-2&email=guest%40example.com#feedback')
    render(<App />)
    await waitFor(() => expect(fixtures.acceptInvite).toHaveBeenCalledWith('https://crrt.ai/api', 'session-token', 'project-2'))
    await waitFor(() => expect(window.location.href).not.toContain('invite='))
    expect(window.location.href).not.toContain('email=')
    expect(window.location.hash).toBe('#feedback')
  })

  it('cleans up a failed invitation and ignores completion after unmount', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState({}, '', '/?invite=missing')
    fixtures.acceptInvite.mockRejectedValueOnce(new Error('gone'))
    const failed = render(<App />)
    await waitFor(() => expect(warn).toHaveBeenCalledWith('Could not accept project invitation', expect.any(Error)))
    await waitFor(() => expect(window.location.search).toBe(''))
    failed.unmount()

    let resolve!: () => void
    fixtures.acceptInvite.mockReturnValueOnce(new Promise<void>((done) => { resolve = done }))
    window.history.replaceState({}, '', '/?invite=late')
    const late = render(<App />)
    await waitFor(() => expect(fixtures.acceptInvite).toHaveBeenLastCalledWith('https://crrt.ai/api', 'session-token', 'late'))
    late.unmount()
    await act(async () => resolve())
    expect(window.location.search).toBe('?invite=late')
  })

  it('does not run review or completion shortcuts for feedback-only guests', async () => {
    fixtures.projects.splice(0, fixtures.projects.length, {
      publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '',
      role: 'guest', capabilities: ['feedback:read', 'feedback:create'],
    })
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Guest-visible feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Guest', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    for (const key of ['a', 'd', 'm']) fireEvent.keyDown(window, { key })

    fireEvent.click(screen.getByRole('button', { name: 'search' }))
    for (const name of ['command accept', 'command reject', 'command done']) {
      fireEvent.click(screen.getByRole('button', { name }))
      if (name !== 'command done') fireEvent.click(screen.getByRole('button', { name: 'search' }))
    }
    expect(fixtures.updateReview).not.toHaveBeenCalled()
    expect(fixtures.updateImpl).not.toHaveBeenCalled()
  })

  it('runs review and completion actions for project managers', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    for (const key of ['a', 'd', 'm']) fireEvent.keyDown(window, { key })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))
    expect(fixtures.updateImpl).toHaveBeenCalledOnce()

    fixtures.updateReview.mockClear(); fixtures.updateImpl.mockClear()
    for (const name of ['command accept', 'command reject', 'command done']) {
      fireEvent.click(screen.getByRole('button', { name: 'search' }))
      fireEvent.click(screen.getByRole('button', { name }))
    }
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))
    expect(fixtures.updateImpl).toHaveBeenCalledOnce()
  })

  it('passes a null agent project while an empty project key is selected', async () => {
    fixtures.projects.splice(0, fixtures.projects.length, {
      publicKey: '', slug: '', name: 'Legacy project', allowedOrigins: [], createdAt: '', updatedAt: '',
    })
    render(<App />)
    await waitFor(() => expect(fixtures.agentProject).toHaveBeenCalledWith(null))
  })

  it('updates feedback visibility optimistically and restores it after failure', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      visibility: 'shared', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    fixtures.comments.push({
      id: 'comment-2', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'main', x: 30, y: 40,
      body: 'Other feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Other member', targetType: 'element_point', anchor: null, githubIssue: null,
      visibility: 'shared', createdAt: '2026-01-02', updatedAt: '2026-01-02',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'change audience' }))
    await waitFor(() => expect(fixtures.updateVisibility).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'internal',
    ))
    expect(screen.getByTestId('detail')).toHaveTextContent(':internal')

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fixtures.updateVisibility.mockRejectedValueOnce(new Error('visibility down'))
    fireEvent.click(screen.getByRole('button', { name: 'change audience' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to update feedback audience:', expect.any(Error)))
    expect(screen.getByTestId('detail')).toHaveTextContent(':internal')

    fixtures.updateVisibility.mockRejectedValueOnce(new Error('missing comment'))
    fireEvent.click(screen.getByRole('button', { name: 'change missing audience' }))
    await waitFor(() => expect(error).toHaveBeenCalledTimes(2))
  })

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
