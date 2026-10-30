import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
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
  commentsProjectId: 'project-1' as string | null,
  claimProject: vi.fn(),
  acceptInvite: vi.fn(),
  updateImpl: vi.fn(),
  updateReview: vi.fn(),
  createShare: vi.fn(),
  getPrompt: vi.fn(),
  beginCheckout: vi.fn(),
  agentProject: vi.fn(),
  agentComments: vi.fn(),
  agentEnabled: vi.fn(),
  adoptSession: vi.fn(),
  agentSession: null as null | { shareId: string },
  agentShareState: null as null | Record<string, any>,
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
  createShare: fixtures.createShare,
  getPrompt: fixtures.getPrompt,
  beginBillingCheckout: fixtures.beginCheckout,
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
    claimProject: fixtures.claimProject,
    checkAvailability: fixtures.fn,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useComments', () => ({
  useComments: () => ({
    comments: fixtures.comments,
    commentsProjectId: fixtures.commentsProjectId,
    loading: false,
    error: null,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useAgentSession', () => ({
  useAgentSession: (_apiBase: string, _accessToken: string, project: string | null, ids: string[], enabled: boolean) => {
    fixtures.agentEnabled(enabled)
    fixtures.agentProject(project)
    fixtures.agentComments(ids)
    return ({
    session: fixtures.agentSession,
    adoptSession: fixtures.adoptSession,
    shareState: fixtures.agentShareState,
    events: fixtures.comments,
    error: null,
    copyPrompt: fixtures.fn,
    })
  },
}))
vi.mock('./hooks/useSuperAdmin', () => ({ useSuperAdmin: () => ({ superadmin: fixtures.superadmin }) }))

vi.mock('./components/CommentDetail', () => ({
  CommentDetail: (props: {
    readOnly?: boolean
    apiBase: string
    accessToken: string
    selectedComment?: { id: string; visibility?: 'shared' | 'internal' } | null
    onVisibilityChange?: (id: string, visibility: 'shared' | 'internal') => void
  }) => <div data-testid="detail" data-read-only={props.readOnly}>
    {props.apiBase}:{props.accessToken}:{props.selectedComment?.visibility ?? 'none'}
    {props.selectedComment && <button onClick={() => props.onVisibilityChange?.(
      props.selectedComment!.id,
      props.selectedComment!.visibility === 'internal' ? 'shared' : 'internal',
    )}>change audience</button>}
    <button onClick={() => props.onVisibilityChange?.('missing-comment', 'internal')}>change missing audience</button>
  </div>,
}))
vi.mock('./components/Header', () => ({ Header: (props: { agentAction?: ReactNode; onAddProject: (key: string, name: string) => void; onOpenExtensionComments: () => void; onOpenSuperAdmin: () => void; selectedProject: string; extensionCommentsActive: boolean; setSelectedProject: (id: string) => void; onOpenCmd: () => void; toggleTheme: () => void; onOpenCommentActivity: (payload: { projectKey: string; latestCommentId: string }) => void }) => <>{props.agentAction}<button aria-pressed={props.extensionCommentsActive} onClick={props.onOpenExtensionComments}>my comments</button><button aria-pressed={props.selectedProject === 'project-1'} onClick={() => props.setSelectedProject('project-1')}>project</button><button onClick={() => props.setSelectedProject('project-2')}>other project</button><button onClick={() => props.onAddProject('new-project', 'New project')}>create project</button><button onClick={props.onOpenSuperAdmin}>super admin</button><button onClick={props.onOpenCmd}>search</button><button onClick={props.toggleTheme}>theme</button><button onClick={() => props.onOpenCommentActivity({ projectKey: 'project-1', latestCommentId: 'comment-1' })}>activity</button></> }))
vi.mock('./components/CommentList', () => ({
  CommentList: (props: { statusFilter: string; filteredComments: Array<{ claimedByAgentId: string | null }>; selectFilter: (filter: 'all') => void; enterBulkMode: () => void; toggleBulkSelect: (id: string) => void; toggleSelectAllVisible: () => void; setSelectedCommentId: (id: string) => void; bulkMode: boolean; bulkSelectedIds: Set<string> }) => <>
    <span data-testid="status-filter">{props.statusFilter}</span>
    <span data-testid="first-claim">{props.filteredComments[0]?.claimedByAgentId ?? 'none'}</span>
    <span data-testid="bulk-state">{props.bulkMode ? `bulk:${[...props.bulkSelectedIds].join(',')}` : 'bulk:off'}</span>
    <button onClick={() => props.selectFilter('all')}>show all</button>
    <button onClick={props.enterBulkMode}>enter bulk</button>
    <button onClick={props.toggleSelectAllVisible}>select visible test comments</button>
    <button onClick={() => props.toggleBulkSelect('comment-1')}>toggle test comment</button>
    <button onClick={() => props.setSelectedCommentId('comment-1')}>select test comment</button>
  </>,
}))
vi.mock('./components/AgentSidebar', () => ({ AgentSidebar: (props: { onClose: () => void; projectComments: Array<{id:string;implementationStatus:string}>; agentConnected:boolean }) => <aside data-testid="agent-sidebar"><span data-testid="agent-queue">{props.agentConnected ? props.projectComments.map(c => `${c.id}:${c.implementationStatus}`).join(',') : 'disconnected'}</span><button onClick={props.onClose}>close agent sidebar</button></aside> }))
vi.mock('./components/StatusBar', () => ({ StatusBar: (props: { personal: boolean }) => <div>{props.personal ? 'personal footer' : 'project footer'}</div> }))
vi.mock('./components/LoginPage', () => ({ LoginPage: () => <div>sign in first</div> }))
vi.mock('./components/ResetPasswordPage', () => ({ ResetPasswordPage: () => null }))
vi.mock('./components/WelcomeScreen', () => ({ WelcomeScreen: (props: { onOpenExtensionComments: () => void }) => <button onClick={props.onOpenExtensionComments}>welcome comments</button> }))
vi.mock('./components/AddProjectPopover', () => ({ AddProjectPopover: () => null }))
vi.mock('./components/ProjectSettings', () => ({ ProjectSettings: ({ project }: { project: { publicKey: string } }) => <div>Settings for {project.publicKey}</div> }))
vi.mock('./components/SuperAdminPanel', () => ({ SuperAdminPanel: () => null }))
vi.mock('./components/ExtensionCommentsPage', () => ({ ExtensionCommentsPage: (props: { onMovedToProject?: (project: string, ids: string[], skipped: number) => void }) => <div>extension page<button onClick={() => props.onMovedToProject?.('project-1', ['moved-1'], 1)}>continue moved Inbox</button><button onClick={() => props.onMovedToProject?.('project-1', ['moved-1', 'moved-2'], 0)}>continue two moved Inbox</button><button onClick={() => props.onMovedToProject?.('project-1', fixtures.comments.map(c => c.id as string), 0)}>continue oversized moved Inbox</button></div> }))
vi.mock('./components/CommandPalette', () => ({ CommandPalette: (props: { onAction: (action: string) => void; canOperateAgent: boolean }) => <div>
  command palette
  <button onClick={() => props.onAction('accept')}>command accept</button>
  <button onClick={() => props.onAction('reject')}>command reject</button>
  <button onClick={() => props.onAction('done')}>command done</button>
  <button onClick={() => props.onAction('filter-ready-for-testing')}>command testing filter</button>
  {props.canOperateAgent && <button onClick={() => props.onAction('toggle-sidebar')}>command agent panel</button>}
</div> }))

import { App } from './App'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  fixtures.signedIn = true
  fixtures.acceptInvite.mockReset().mockResolvedValue(undefined)
  fixtures.claimProject.mockReset().mockResolvedValue({ publicKey: 'new-project' })
  fixtures.updateImpl.mockReset().mockResolvedValue(undefined)
  fixtures.updateReview.mockReset().mockResolvedValue({ updatedAt: '2026-10-29T12:00:00.000Z' })
  fixtures.createShare.mockReset().mockResolvedValue({ shareId: 'share-1', commentCount: 1 })
  fixtures.getPrompt.mockReset().mockResolvedValue({ prompt: 'Fix selected feedback' })
  fixtures.beginCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.example/session' })
  fixtures.fn.mockReset()
  fixtures.agentSession = null
  fixtures.agentShareState = null
  fixtures.agentProject.mockReset()
  fixtures.agentComments.mockReset()
  fixtures.updateVisibility.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  fixtures.commentsProjectId = 'project-1'
  fixtures.comments.splice(0)
  fixtures.projects.splice(0, fixtures.projects.length, { publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '' })
  fixtures.superadmin = false
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: vi.fn((key: string) => key === 'dashboard-theme' ? 'dark' : '1'), setItem: vi.fn() } })
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

it('deselects a directly selected feedback item without opening it', async () => {
  fixtures.comments = [{id:'comment-1',projectId:'project-1',body:'Feedback',reviewStatus:'open',implementationStatus:'unassigned',claimedByAgentId:null,createdAt:'',updatedAt:''}]
  render(<App />)
  fireEvent.click(await screen.findByRole('button', {name:'toggle test comment'}))
  expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
  fireEvent.click(screen.getByRole('button', {name:'toggle test comment'}))
  expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:')
  expect(screen.getByTestId('bulk-state')).not.toHaveTextContent('comment-1')
  expect(fixtures.updateReview).not.toHaveBeenCalled()
})

describe('<App /> GitHub issue wiring', () => {
  it('opens the feedback list on Open', async () => {
    render(<App />)
    expect(await screen.findByTestId('status-filter')).toHaveTextContent('open')
  })

  it('opens the reviewer testing queue from the command palette', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'search' }))
    fireEvent.click(screen.getByRole('button', { name: 'command testing filter' }))
    expect(screen.getByTestId('status-filter')).toHaveTextContent('ready_for_testing')
  })

  it('returns to Open after creating a project', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
    expect(screen.getByTestId('status-filter')).toHaveTextContent('all')
    fireEvent.click(screen.getByRole('button', { name: 'create project' }))
    await waitFor(() => expect(fixtures.claimProject).toHaveBeenCalledWith('new-project', 'New project'))
    expect(screen.getByTestId('status-filter')).toHaveTextContent('open')
  })

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

  it('disables global dashboard shortcuts while retaining mouse search and Escape', async () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue('disabled')
    render(<App />)
    await screen.findByRole('button', { name: 'search' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.queryByRole('button', { name: 'command accept' })).toBeNull()
    for (const key of ['j', 'k', 'a', 'd', 'm', 's', 'ArrowDown', ' ']) fireEvent.keyDown(window, { key })
    expect(fixtures.updateReview).not.toHaveBeenCalled()
    expect(fixtures.updateImpl).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'search' }))
    expect(screen.getByRole('button', { name: 'command accept' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'command accept' })).toBeNull()
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

  it('optimistically clears the previous agent when reopening Done', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Completed feedback', reviewStatus: 'accepted', implementationStatus: 'done', claimedByAgentId: 'old-agent',
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    expect(screen.getByTestId('first-claim')).toHaveTextContent('old-agent')

    fireEvent.keyDown(window, { key: 'm' })

    await waitFor(() => expect(fixtures.updateImpl).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'unassigned',
    ))
    expect(screen.getByTestId('first-claim')).toHaveTextContent('none')
  })

  it('refreshes issue lifecycle state after a successful bulk rejection', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'rejected', '2026-01-01', undefined, {captureUndo:true,preserveExternalWork:true},
    ))
    await waitFor(() => expect(fixtures.fn).toHaveBeenCalled())
  })

  it('keeps a bulk selection after marking it ready and hands off exactly those comments', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com/a', selector: 'body', x: 10, y: 20,
      body: 'Ship this change', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    expect(screen.getByText('0 of 1 ready')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'accepted',
    ))
    expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Send to Claude Code' }))
    await waitFor(() => expect(fixtures.createShare).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', {
        projectId: 'project-1', scopeType: 'selection', commentIds: ['comment-1'],
      },
    ))
    expect(fixtures.getPrompt).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'share-1', 'claude-code',
    )
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Fix selected feedback')
    expect(screen.getByRole('status')).toHaveTextContent('1 selected item copied for Claude Code.')
  })

  it('sends an unpaid owner to checkout without dropping the selected feedback', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com/a', selector: 'body', x: 10, y: 20,
      body: 'Paid handoff', reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Owner', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    fixtures.createShare.mockRejectedValueOnce(Object.assign(new Error('Upgrade the project plan to use Agent'), {
      status: 402, code: 'upgrade_required',
    }))
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))

    await waitFor(() => expect(fixtures.beginCheckout).toHaveBeenCalledWith('https://crrt.ai/api', 'session-token'))
    expect(assign).toHaveBeenCalledWith('https://checkout.example/session')
    expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
  })

  it('keeps the selection when a handoff changes or checkout cannot open', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com/a', selector: 'body', x: 10, y: 20,
      body: 'Retry handoff', reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Owner', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    fixtures.createShare.mockResolvedValueOnce({ shareId: 'share-1', commentCount: 0 })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
    await screen.findByText('Feedback changed. Review the selection and retry.')
    expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')

    fixtures.createShare.mockRejectedValueOnce(Object.assign(new Error('Upgrade'), { code: 'upgrade_required' }))
    fixtures.beginCheckout.mockRejectedValueOnce(new Error('Checkout unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
    await screen.findByText('Checkout unavailable')
    expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
  })

  it('keeps project status actions in the floating bulk menu', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com/a', selector: 'body', x: 10, y: 20,
      body: 'Lifecycle action', reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
    fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'accepted', '2026-01-01', 'done',
    ))
    await waitFor(() => expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off'))

    fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenLastCalledWith(
      'https://crrt.ai/api', 'session-token', 'comment-1', 'rejected', expect.any(String), undefined, {captureUndo:true,preserveExternalWork:true},
    ))
  })

  it('does not let an older rejection response refresh over a later review choice', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    let resolveReject!: () => void
    let resolveAccept!: () => void
    fixtures.updateReview
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveReject = resolve }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveAccept = resolve }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    fireEvent.keyDown(window, { key: 'd' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))

    await act(async () => resolveAccept())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
    await act(async () => resolveReject())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when an older individual review fails after a newer choice', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectOlder!: (reason?: unknown) => void
    let resolveNewer!: () => void
    fixtures.updateReview
      .mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectOlder = reject }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveNewer = resolve }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    fireEvent.keyDown(window, { key: 'd' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))

    await act(async () => resolveNewer())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
    await act(async () => rejectOlder(new Error('older failed')))
    expect(error).toHaveBeenCalledWith('Failed to update review status:', expect.any(Error))
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when an older successful bulk review loses ownership', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    let resolveBulk!: () => void
    let resolveIndividual!: () => void
    fixtures.updateReview
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveBulk = resolve }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveIndividual = resolve }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))

    await act(async () => resolveIndividual())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
    await act(async () => resolveBulk())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when an older failed bulk review loses ownership', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectBulk!: (reason?: unknown) => void
    let resolveIndividual!: () => void
    fixtures.updateReview
      .mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectBulk = reject }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveIndividual = resolve }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))

    await act(async () => resolveIndividual())
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
    await act(async () => rejectBulk(new Error('older bulk failed')))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bulk reject'), expect.any(Array))
    expect(fixtures.fn).toHaveBeenCalledTimes(1)
  })

  it('refreshes the current review after an individual or bulk request fails', async () => {
    fixtures.comments.push({
      id: 'comment-1', projectId: 'project-1', pageUrl: 'https://example.com', selector: 'body', x: 10, y: 20,
      body: 'Managed feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
      imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, githubIssue: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fixtures.updateReview.mockRejectedValueOnce(new Error('individual failed'))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'select test comment' }))
    fireEvent.keyDown(window, { key: 'd' })
    await waitFor(() => expect(fixtures.fn).toHaveBeenCalledTimes(1))

    fixtures.updateReview.mockRejectedValueOnce(new Error('bulk failed'))
    fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'toggle test comment' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fixtures.fn).toHaveBeenCalledTimes(2))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bulk reject'), expect.any(Array))
  })

  it('passes a null agent project while an empty project key is selected', async () => {
    fixtures.projects.splice(0, fixtures.projects.length, {
      publicKey: '', slug: '', name: 'Legacy project', allowedOrigins: [], createdAt: '', updatedAt: '',
    })
    render(<App />)
    await waitFor(() => expect(fixtures.agentProject).toHaveBeenCalledWith(null))
  })

  it('keeps the live Agent session behind every available launcher path', async () => {
    render(<App />)
    const launcher = await screen.findByRole('button', { name: 'Agents, 0 ready' })
    expect(fixtures.agentProject).toHaveBeenLastCalledWith('project-1')
    expect(fixtures.agentEnabled).toHaveBeenLastCalledWith(false)

    fireEvent.click(launcher)
    await waitFor(() => expect(fixtures.agentProject).toHaveBeenCalledWith('project-1'))
    expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
    expect(launcher).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'close agent sidebar' }))
    expect(screen.queryByTestId('agent-sidebar')).toBeNull()

    fireEvent.keyDown(window, { key: 's' })
    expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 's' })
    expect(screen.queryByTestId('agent-sidebar')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'search' }))
    fireEvent.click(screen.getByRole('button', { name: 'command agent panel' }))
    expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
  })

  it('keeps Agents visible but closes and disables every opening path outside authorized feedback', async () => {
    fixtures.projects.splice(0, fixtures.projects.length, {
      publicKey: 'project-1', slug: 'project-1', name: 'Project', allowedOrigins: [], createdAt: '', updatedAt: '',
      role: 'guest', capabilities: ['feedback:read', 'feedback:create'],
    })
    render(<App />)
    const launcher = await screen.findByRole('button', { name: 'Agents unavailable: Agents are unavailable for your project role.' })
    expect(launcher).toBeDisabled()
    await waitFor(() => expect(fixtures.agentProject).toHaveBeenCalledWith(null))
    fireEvent.keyDown(window, { key: 's' })
    expect(screen.queryByTestId('agent-sidebar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'search' }))
    expect(screen.queryByRole('button', { name: 'command agent panel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'project footer' })).toBeNull()
    expect(screen.getByText('project footer')).toBeInTheDocument()
  })

  it('closes the Agent sidebar when leaving project feedback', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Agents, 0 ready' }))
    expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'my comments' }))
    expect(screen.queryByTestId('agent-sidebar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Agents unavailable: Open project feedback to use Agents.' })).toBeDisabled()
    await waitFor(() => expect(fixtures.agentProject).toHaveBeenLastCalledWith(null))
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

  it('continues a moved Inbox selection in its destination project', async () => {
    fixtures.comments.push({
      id: 'moved-1', projectId: 'project-1', body: 'Moved feedback', reviewStatus: 'open', implementationStatus: 'unassigned',
      claimedByAgentId: null, createdAt: '', updatedAt: '', authorName: 'You', imageUrl: null,
    })
    window.history.replaceState({}, '', '/?view=extension-comments')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'continue moved Inbox' }))
    await waitFor(() => expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:moved-1'))
    expect(screen.getByRole('status')).toHaveTextContent('1 Inbox item moved; 1 skipped.')
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
    expect(screen.queryByRole('button', { name: 'personal footer' })).toBeNull()
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

it('refreshes memberships when the dashboard regains focus', () => {
  render(<App />)
  fixtures.fn.mockClear()
  fireEvent(window, new Event('focus'))
  expect(fixtures.fn).toHaveBeenCalledTimes(1)
})

it('opens project settings from an authorized email review link without accepting automatically', async () => {
  fixtures.projects.push({ ...fixtures.projects[0], publicKey: 'review-target', capabilities: ['project:manage'] })
  window.history.replaceState({}, '', '/?accessProject=review-target')
  render(<App />)
  expect(await screen.findByText('Settings for review-target')).toBeInTheDocument()
  expect(fixtures.acceptInvite).not.toHaveBeenCalled()
})
it('shows a clear error when the review link targets an inaccessible project', async () => {
  window.history.replaceState({}, '', '/?accessProject=missing')
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('owner or admin')
})

function readyFeedback(id: string, visibility = 'shared') {
 return { id, projectId: 'project-1', pageUrl: 'https://example.com/a', selector: 'body', x: 10, y: 20, body: id, reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null, imageUrl: null, authorName: 'Member', targetType: 'element_point', anchor: null, visibility, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
}

it('rejects an exact handoff when a selected comment disappears during refresh', async () => {
 fixtures.comments = [readyFeedback('comment-1'), readyFeedback('comment-2')]
 const view = render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
 fixtures.comments = [readyFeedback('comment-1')]
 view.rerender(<App />)
 await screen.findByRole('button', { name: 'Agents, 1 ready' })
 fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
 expect(screen.getByRole('alert')).toHaveTextContent('Feedback changed')
 expect(fixtures.createShare).not.toHaveBeenCalled()
})

it('excludes internal feedback from Agent discovery and explains an internal bulk selection', async () => {
 fixtures.comments = [readyFeedback('comment-1'), readyFeedback('internal', 'internal')]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'Agents, 1 ready' }))
 expect(fixtures.agentComments).toHaveBeenLastCalledWith(['comment-1'])
 fireEvent.click(screen.getByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
 expect(screen.getByRole('alert')).toHaveTextContent('Only shared feedback')
 expect(fixtures.createShare).not.toHaveBeenCalled()
})

it.each(['cancel', 'navigate'])('does not resurrect old bulk failures after %s', async (action) => {
 fixtures.comments = [readyFeedback('comment-1')]
 let reject!: (error: Error) => void
 fixtures.updateReview.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
 if (action === 'cancel') fireEvent.keyDown(window, { key: 'Escape' })
 else fireEvent.click(screen.getByRole('button', { name: 'other project' }))
 await act(async () => reject(new Error('old failure')))
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off')
 expect(screen.queryByRole('alert')).toBeNull()
 expect(fixtures.fn).not.toHaveBeenCalled()
})

it('does not clear a newer selection after an older successful bulk completion', async () => {
 fixtures.comments = [readyFeedback('comment-1')]
 let finish!: () => void
 fixtures.updateReview.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
 fireEvent.keyDown(window, { key: 'Escape' })
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 await act(async () => finish())
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
})

it('does not restore selection after cancellation during the refresh await', async () => {
 fixtures.comments = [readyFeedback('comment-1')]
 let refreshed!: () => void
 fixtures.fn.mockReturnValueOnce(new Promise<void>((resolve) => { refreshed = resolve }))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
 await waitFor(() => expect(fixtures.fn).toHaveBeenCalled())
 fireEvent.keyDown(window, { key: 'Escape' })
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 await act(async () => refreshed())
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
})

it.each(['share', 'prompt', 'clipboard', 'failure'])('discards stale %s handoff completion after cancel', async (step) => {
 fixtures.comments = [readyFeedback('comment-1')]
 let finish!: (value: any) => void
 let fail!: (value: any) => void
 const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject })
 if (step === 'share' || step === 'failure') fixtures.createShare.mockReturnValueOnce(pending)
 if (step === 'prompt') fixtures.getPrompt.mockReturnValueOnce(pending)
 if (step === 'clipboard') vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(pending as Promise<void>)
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
 if (step === 'prompt') await waitFor(() => expect(fixtures.getPrompt).toHaveBeenCalled())
 if (step === 'clipboard') await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
 fireEvent.keyDown(window, { key: 'Escape' })
 await act(async () => { if (step === 'failure') fail(new Error('old handoff')); else finish(step === 'share' ? { shareId:'share-1',commentCount:1 } : { prompt: 'old prompt' }) })
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off')
 expect(screen.queryByRole('status')).toBeNull()
 expect(screen.queryByRole('alert')).toBeNull()
 if (step === 'share' || step === 'failure') expect(fixtures.getPrompt).not.toHaveBeenCalled()
})

it('retains a partially failed ready selection and leaves unselected comments untouched', async () => {
 fixtures.comments = [readyFeedback('comment-1'), readyFeedback('other')].map(c => ({...c,reviewStatus:'open'}))
 fixtures.updateReview.mockRejectedValueOnce(new Error('ready failed'))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByText('1 item could not be updated and remain selected.')
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
 expect(fixtures.updateReview).toHaveBeenCalledTimes(1)
})
it('keeps only failed items after a partial multi-item rejection', async () => {
 fixtures.comments = [readyFeedback('comment-1'), readyFeedback('comment-2'), readyFeedback('comment-3')]
 fixtures.updateReview.mockRejectedValueOnce(new Error('one')).mockRejectedValueOnce(new Error('two'))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
 await screen.findByText('2 items could not be updated and remain selected.')
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1,comment-2')
})
it('selects a notification target when its feedback arrives later', async () => {
 const view = render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'activity' }))
 fixtures.comments = [readyFeedback('comment-1')]
 view.rerender(<App />)
 await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent(':shared'))
})
it('reports a non-Error checkout failure', async () => {
 fixtures.comments = [readyFeedback('comment-1')]
 fixtures.createShare.mockRejectedValueOnce(Object.assign(new Error('Upgrade'), {code:'upgrade_required'}))
 fixtures.beginCheckout.mockRejectedValueOnce('offline')
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
 await screen.findByText('Could not open plan upgrade.')
})
it.each(['success','failure'])('discards a canceled checkout %s', async step => {
 fixtures.comments = [readyFeedback('comment-1')]
 fixtures.createShare.mockRejectedValueOnce(Object.assign(new Error('Upgrade'), {code:'upgrade_required'}))
 let finish!: (value: any) => void; let fail!: (value: any) => void
 fixtures.beginCheckout.mockReturnValueOnce(new Promise((resolve,reject) => { finish=resolve; fail=reject }))
 const assign = vi.spyOn(window.location,'assign').mockImplementation(() => {})
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'enter bulk' }))
 fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
 fireEvent.click(screen.getByRole('button', { name: 'Send to Claude Code' }))
 await waitFor(() => expect(fixtures.beginCheckout).toHaveBeenCalled())
 fireEvent.keyDown(window,{key:'Escape'})
 await act(async () => { if(step==='success') finish({url:'https://checkout.example'}); else fail(new Error('old checkout')) })
 expect(assign).not.toHaveBeenCalled()
 expect(screen.queryByRole('alert')).toBeNull()
})

it('rejects a handoff until loaded comments belong to the current project', async () => {
 fixtures.projects.push({publicKey:'project-2',slug:'project-2',name:'Other',allowedOrigins:[],createdAt:'',updatedAt:''})
 fixtures.comments = [readyFeedback('comment-1')]
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'other project'}))
 fireEvent.click(screen.getByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'enter bulk'}))
 fireEvent.click(screen.getByRole('button',{name:'toggle test comment'}))
 fireEvent.click(screen.getByRole('button',{name:'Send to Claude Code'}))
 expect(screen.getByRole('alert')).toHaveTextContent('Feedback changed')
 expect(fixtures.createShare).not.toHaveBeenCalled()
})

it('reports a complete multi-item Inbox move without a skipped notice', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'my comments' }))
  fireEvent.click(screen.getByRole('button', { name: 'continue two moved Inbox' }))
  expect(screen.getByRole('status')).toHaveTextContent('2 Inbox items moved.')
})

it.each(['success','failure'])('handles a two-comment prompt %s without silent omissions', async step => {
 fixtures.comments = [readyFeedback('comment-1'),readyFeedback('comment-2')]
 fixtures.createShare.mockResolvedValueOnce({shareId:'share-1',commentCount:2})
 if(step==='failure') fixtures.getPrompt.mockRejectedValueOnce(new Error(''))
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'enter bulk'}))
 fireEvent.click(screen.getByRole('button',{name:'select visible test comments'}))
 fireEvent.click(screen.getByRole('button',{name:'Send to Claude Code'}))
 if(step==='success') await screen.findByText('2 selected items copied for Claude Code.')
 else await screen.findByText('Could not send the selected feedback to Agent.')
 expect(fixtures.createShare).toHaveBeenCalledWith('https://crrt.ai/api','session-token',{projectId:'project-1',scopeType:'selection',commentIds:['comment-1','comment-2']})
})


it('refuses oversized Select all without silently selecting a subset', async () => {
 fixtures.comments=Array.from({length:501},(_,i)=>readyFeedback(`comment-${i}`))
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'enter bulk'}))
 fireEvent.click(screen.getByRole('button',{name:'select visible test comments'}))
 expect(screen.getByRole('alert')).toHaveTextContent('up to 500')
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:')
 expect(fixtures.createShare).not.toHaveBeenCalled()
})

it('adopts a completed bulk handoff into the Agent sidebar',async()=>{
 fixtures.comments=[readyFeedback('comment-1')]
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'enter bulk'}))
 fireEvent.click(screen.getByRole('button',{name:'toggle test comment'}))
 fireEvent.click(screen.getByRole('button',{name:'Send to Claude Code'}))
 await screen.findByText('1 selected item copied for Claude Code.')
 expect(fixtures.adoptSession).toHaveBeenCalledWith(expect.objectContaining({shareId:'share-1'}),['comment-1'])
 expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
})


it('caps individual project selection at 500',async()=>{
 fixtures.comments=Array.from({length:500},(_,i)=>readyFeedback(`item-${i}`))
 const view=render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'enter bulk'}))
 fireEvent.click(screen.getByRole('button',{name:'select visible test comments'}))
 fixtures.comments=[...fixtures.comments,readyFeedback('comment-1')]
 view.rerender(<App />)
 fireEvent.click(screen.getByRole('button',{name:'toggle test comment'}))
 expect(screen.getByRole('alert')).toHaveTextContent('up to 500')
 expect(screen.getByTestId('bulk-state').textContent?.split(',')).toHaveLength(500)
})

it('rejects oversized inherited Inbox selections before requesting a handoff',async()=>{
 fixtures.comments=Array.from({length:501},(_,i)=>readyFeedback(`item-${i}`))
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'my comments'}))
 fireEvent.click(screen.getByRole('button',{name:'continue oversized moved Inbox'}))
 fireEvent.click(screen.getByRole('button',{name:'Send to Claude Code'}))
 expect(screen.getByRole('alert')).toHaveTextContent('up to 500')
 expect(fixtures.createShare).not.toHaveBeenCalled()
})

it('does not restore a cancelled Inbox transfer when destination comments finish loading', async () => {
  fixtures.commentsProjectId = null
  const view = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'my comments' }))
  fireEvent.click(screen.getByRole('button', { name: 'continue moved Inbox' }))
  expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:moved-1')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off')
  fixtures.commentsProjectId = 'project-1'
  fixtures.comments = [{ id: 'moved-1', projectId: 'project-1', body: 'Moved feedback', reviewStatus: 'open', implementationStatus: 'unassigned', createdAt: '', updatedAt: '' }]
  view.rerender(<App />)
  await waitFor(() => expect(screen.getByTestId('first-claim')).toHaveTextContent('none'))
  expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off')
})

it('renders only active handoff feedback and its live progress, excluding unselected and internal project items', async () => {
 fixtures.comments = [readyFeedback('selected-1'),readyFeedback('selected-2'),readyFeedback('unselected'),{...readyFeedback('internal'),visibility:'internal'}]
 fixtures.agentSession = {shareId:'active-share'}
 fixtures.agentShareState = {share:{id:'active-share'},project:{publicKey:'project-1'},presence:[{agentId:'local'}],comments:[
   {...readyFeedback('selected-1'),implementationStatus:'in_progress'},
   {...readyFeedback('selected-2'),implementationStatus:'ready_for_testing'},
   {...readyFeedback('internal'),visibility:'internal'},
 ]}
 const view = render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'Agents, 3 ready'}))
 expect(screen.getByTestId('agent-queue')).toHaveTextContent('selected-1:in_progress,selected-2:ready_for_testing')
 expect(screen.getByTestId('agent-queue')).not.toHaveTextContent('unselected')
 expect(screen.getByTestId('agent-queue')).not.toHaveTextContent('internal')
 fixtures.agentShareState = {...fixtures.agentShareState,comments:[{...readyFeedback('selected-1'),implementationStatus:'done'}]}
 view.rerender(<App />)
 expect(screen.getByTestId('agent-queue')).toHaveTextContent('selected-1:done')
 expect(screen.getByTestId('agent-queue')).not.toHaveTextContent('selected-2')
})
it.each(['loading','missing session','stale share','wrong project','empty state'])('does not show a queue from %s',async(context)=>{
 fixtures.comments=[readyFeedback('comment-1')]
 fixtures.agentSession=context==='missing session'?null:{shareId:'active-share'}
 fixtures.agentShareState=context==='loading'?null:{share:{id:context==='stale share'?'old-share':'active-share'},project:{publicKey:context==='wrong project'?'other-project':'project-1'},presence:[{agentId:'local'}],comments:context==='empty state'?[]:[readyFeedback('comment-1')]}
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'Agents, 1 ready'}))
 expect(screen.getByTestId('agent-queue')).toHaveTextContent(context==='empty state'?'':'disconnected')
 expect(screen.getByTestId('agent-queue')).not.toHaveTextContent('comment-1')
})
it('explains expired-plan write rejection, restores retained feedback and disables further writes',async()=>{
 fixtures.comments.push({id:'comment-1',projectId:'project-1',body:'Retained feedback',reviewStatus:'open',implementationStatus:'unassigned',createdAt:'2026-01-01',updatedAt:'2026-01-01'})
 fixtures.updateImpl.mockRejectedValueOnce(Object.assign(new Error('The owner needs an active Cloud plan. Feedback remains readable.'),{status:402,resource:'subscription'}))
 vi.spyOn(console,'error').mockImplementation(()=>{})
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'select test comment'}));fireEvent.keyDown(window,{key:'m'})
 await screen.findByRole('alert');expect(screen.getByRole('alert')).toHaveTextContent('Feedback remains readable')
 expect(screen.getByTestId('detail')).toHaveAttribute('data-read-only','true')
 expect(fixtures.fn).toHaveBeenCalled();fireEvent.keyDown(window,{key:'m'});expect(fixtures.updateImpl).toHaveBeenCalledOnce()
})


it.each(['done', 'accepted', 'rejected'])('reopens selected %s feedback together', async (status) => {
 const comment = { projectId: 'project-1', body: 'Feedback', reviewStatus: status === 'done' ? 'accepted' : status, implementationStatus: status === 'done' ? 'done' : 'unassigned', claimedByAgentId: 'agent', createdAt: '', updatedAt: '' }
 fixtures.comments.push({ ...comment, id: 'comment-1' }, { ...comment, id: 'comment-2' })
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'show all' }))
 fireEvent.click(screen.getByRole('button', { name: 'select visible test comments' }))
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1,comment-2')
 fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
 await waitFor(() => expect(fixtures.updateReview).toHaveBeenCalledTimes(2))
 for (const id of ['comment-1', 'comment-2']) {
  expect(fixtures.updateReview).toHaveBeenCalledWith('https://crrt.ai/api', 'session-token', id, 'open', '', 'unassigned', {captureUndo:true,preserveExternalWork:true})
  expect(fixtures.updateImpl).not.toHaveBeenCalled()
 }
 expect(fixtures.updateReview).toHaveBeenCalledTimes(2)
 expect(screen.getByTestId('first-claim')).toHaveTextContent('none')
 await waitFor(() => expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off'))
})

it('keeps failed reopen items selected for retry and reports partial failure', async () => {
 fixtures.comments.push(...['comment-1', 'comment-2'].map(id => ({ id, projectId: 'project-1', body: 'Feedback', reviewStatus: 'open', implementationStatus: 'unassigned', createdAt: '', updatedAt: '' })))
 fixtures.updateReview.mockRejectedValueOnce(new Error('offline'))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
 await waitFor(() => expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1'))
 expect(screen.getByText('1 item could not be updated and remain selected.')).toBeInTheDocument()
})

it('keeps Reopen busy until its atomic request settles', async () => {
 let fail!: (error:Error)=>void
 fixtures.updateReview.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject}))
 fixtures.comments=[{...readyFeedback('comment-1'),implementationStatus:'done'}]
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'select visible test comments'}))
 fireEvent.click(screen.getByRole('button',{name:'Reopen'}))
 expect(screen.getByRole('button',{name:'Reopen'})).toBeDisabled()
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
 await act(async()=>fail(new Error('offline')))
 await screen.findByText('1 item could not be updated and remain selected.')
 expect(screen.getByRole('button',{name:'Reopen'})).toBeEnabled()
})

it('rejects the visible list in two clicks without changing implementation status', async () => {
 fixtures.comments.push(...['comment-1', 'comment-2'].map(id => ({ id, projectId: 'project-1', body: 'Feedback', reviewStatus: 'open', implementationStatus: 'unassigned', createdAt: '', updatedAt: '' })))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
 await waitFor(() => expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off'))
 expect(fixtures.updateReview).toHaveBeenCalledTimes(2)
 for (const id of ['comment-1', 'comment-2']) expect(fixtures.updateReview).toHaveBeenCalledWith('https://crrt.ai/api', 'session-token', id, 'rejected', '', undefined, {captureUndo:true,preserveExternalWork:true})
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
})

it('undoes bulk approval in one click and retries only failed restores', async () => {
 fixtures.comments = ['comment-1', 'comment-2'].map(id => ({ ...readyFeedback(id), reviewStatus: 'open' }))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 fixtures.updateReview.mockRejectedValueOnce(new Error('offline'))
 fireEvent.click(undo)
 await screen.findByText('Some items could not be restored. Undo retries only those items.')
 expect(fixtures.updateReview).toHaveBeenCalledTimes(4)
 fireEvent.click(screen.getByRole('button', { name: 'Undo mark ready' }))
 await screen.findByText('Previous statuses restored.')
 expect(fixtures.updateReview).toHaveBeenCalledTimes(5)
 expect(fixtures.updateReview).toHaveBeenLastCalledWith('https://crrt.ai/api', 'session-token', 'comment-1', 'open', '2026-10-29T12:00:00.000Z', undefined)
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
})

it('does not offer undo for failed approvals and clears it when changing projects', async () => {
 fixtures.comments = ['comment-1', 'comment-2'].map(id => ({ ...readyFeedback(id), reviewStatus: 'open' }))
 fixtures.updateReview.mockRejectedValueOnce(new Error('offline'))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByText('1 marked ready.')
 fireEvent.click(screen.getByRole('button', { name: 'Undo mark ready' }))
 await screen.findByText('Previous statuses restored.')
 expect(fixtures.updateReview).toHaveBeenCalledTimes(3)
 expect(fixtures.updateReview).toHaveBeenLastCalledWith('https://crrt.ai/api', 'session-token', 'comment-2', 'open', '2026-10-29T12:00:00.000Z', undefined)
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByRole('button', { name: 'Undo mark ready' })
 fireEvent.click(screen.getByRole('button', { name: 'other project' }))
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
})

it.each(['review', 'implementation', 'claim', 'missing'])('refuses undo after refreshed %s changes', async (change) => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 const rendered = render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByRole('button', { name: 'Undo mark ready' })
 fixtures.comments = change === 'missing' ? [] : [{ ...readyFeedback('comment-1'), ...(change === 'review' ? {reviewStatus:'rejected'} : change === 'implementation' ? {implementationStatus:'in_progress'} : {claimedByAgentId:'new-agent'}) }]
 rendered.rerender(<App />)
 fireEvent.click(screen.getByRole('button', { name: 'Undo mark ready' }))
 await screen.findByText('Some items could not be restored. Undo retries only those items.')
 expect(fixtures.updateReview).toHaveBeenCalledTimes(1)
})

it('ignores a late undo response after changing project', async () => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByRole('button', { name: 'Undo mark ready' })
 let finish!: () => void
 fixtures.updateReview.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
 fireEvent.click(screen.getByRole('button', { name: 'Undo mark ready' }))
 expect(screen.getByRole('button', { name: 'Undo mark ready' })).toBeDisabled()
 fireEvent.click(screen.getByRole('button', { name: 'other project' }))
 await act(async () => finish())
 expect(screen.queryByText('Previous statuses restored.')).toBeNull()
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
})

it.each(['success', 'failure'])('ignores a late Undo %s after a newer local status action', async (result) => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 let finish!: () => void
 fixtures.updateReview.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
  finish = () => result === 'success' ? resolve() : reject(new Error('offline'))
 }))
 fireEvent.click(undo)
 fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
 fireEvent.keyDown(window, { key: 'm' })
 await waitFor(() => expect(fixtures.updateImpl).toHaveBeenCalledOnce())
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 expect(screen.getByRole('button', { name: 'Mark done' })).toBeEnabled()
 const refreshCalls = fixtures.fn.mock.calls.length
 await act(async () => finish())
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 expect(screen.queryByText('Previous statuses restored.')).toBeNull()
 expect(screen.queryByText('Some items could not be restored. Undo retries only those items.')).toBeNull()
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls + 1)
})

it('reports subscription failures from Undo and blocks further writes', async () => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 fixtures.updateReview.mockRejectedValueOnce(Object.assign(new Error('The owner needs an active Cloud plan. Feedback remains readable.'), { status: 402, resource: 'subscription' }))
 fireEvent.click(undo)
 await waitFor(() => expect(screen.getByTestId('detail')).toHaveAttribute('data-read-only', 'true'))
 expect(screen.getByText('The owner needs an active Cloud plan. Feedback remains readable.')).toBeInTheDocument()
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
 fireEvent.keyDown(window, { key: 'm' })
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
})

it('never offers an unfenced Undo when the server omits the changed version', async () => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 fixtures.updateReview.mockResolvedValueOnce({})
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await waitFor(() => expect(screen.getByRole('button', { name: 'Send to Claude Code' })).toBeEnabled())
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
})

it('discards a conflicting Undo version without reverting newer feedback', async () => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 await screen.findByRole('button', { name: 'Undo mark ready' })
 fixtures.updateReview.mockRejectedValueOnce(Object.assign(new Error('changed'), {status:409}))
 fireEvent.click(screen.getByRole('button', { name: 'Undo mark ready' }))
 await screen.findByText('Feedback changed after this action and was not undone. Refresh to review it.')
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 expect(screen.getByRole('button', { name: 'Send to Claude Code' })).toBeEnabled()
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
})

it.each(['stay', 'navigate'])('waits for a newer write before reconciling invalidated Undo (%s)', async (navigation) => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 let finishUndo!: () => void
 let finishWrite!: () => void
 fixtures.updateReview.mockImplementationOnce(() => new Promise<void>(resolve => { finishUndo = resolve }))
 fixtures.updateImpl.mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve }))
 fireEvent.click(undo)
 fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
 fireEvent.keyDown(window, { key: 'm' })
 const refreshCalls = fixtures.fn.mock.calls.length
 await act(async () => finishUndo())
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls)
 if (navigation === 'navigate') fireEvent.click(screen.getByRole('button', { name: 'other project' }))
 await act(async () => finishWrite())
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls + (navigation === 'stay' ? 1 : 0))
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 expect(screen.queryByText('Previous statuses restored.')).toBeNull()
})

it.each(['stay', 'navigate'])('guards reconciliation data when another write starts during the fetch (%s)', async (navigation) => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 let finishUndo!: () => void
 fixtures.updateReview.mockImplementationOnce(() => new Promise<void>(resolve => { finishUndo = resolve }))
 fireEvent.click(undo)
 fireEvent.click(screen.getByRole('button', { name: 'select test comment' }))
 fireEvent.keyDown(window, { key: 'm' })
 await act(async () => {})
 let canApply!: () => boolean
 let finishRead!: () => void
 const refreshCalls = fixtures.fn.mock.calls.length
 fixtures.fn.mockImplementationOnce((guard: () => boolean) => {
  canApply = guard
  return new Promise<void>(resolve => { finishRead = resolve })
 })
 await act(async () => finishUndo())
 expect(canApply()).toBe(true)
 let finishWrite!: () => void
 fixtures.updateImpl.mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve }))
 fireEvent.keyDown(window, { key: 'm' })
 expect(canApply()).toBe(false)
 if (navigation === 'navigate') fireEvent.click(screen.getByRole('button', { name: 'other project' }))
 await act(async () => finishRead())
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls + 1)
 await act(async () => finishWrite())
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls + (navigation === 'stay' ? 2 : 1))
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
})

it('discards the in-flight Undo snapshot and reconciles after Escape cancels bulk selection', async () => {
 fixtures.comments = [{ ...readyFeedback('comment-1'), reviewStatus: 'open' }]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', { name: 'select visible test comments' }))
 fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
 const undo = await screen.findByRole('button', { name: 'Undo mark ready' })
 let finishUndo!: () => void
 fixtures.updateReview.mockImplementationOnce(() => new Promise<void>(resolve => { finishUndo = resolve }))
 fireEvent.click(undo)
 fireEvent.keyDown(window, { key: 'Escape' })
 const refreshCalls = fixtures.fn.mock.calls.length
 await act(async () => finishUndo())
 expect(fixtures.fn).toHaveBeenCalledTimes(refreshCalls + 1)
 expect(screen.queryByRole('button', { name: 'Undo mark ready' })).toBeNull()
 expect(screen.queryByText('Previous statuses restored.')).toBeNull()
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:off')
})


it.each(['unassigned', 'claimed', 'in_progress', 'blocked', 'ready_for_testing'])('undoes completion back to %s without changing the agent claim', async (implementationStatus) => {
 fixtures.comments = [{...readyFeedback('comment-1'), implementationStatus, claimedByAgentId:implementationStatus==='unassigned'?null:'agent-1', updatedAt:'2026-10-30T10:00:00Z'}]
 render(<App />)
 fireEvent.click(await screen.findByRole('button', {name:'show all'}))
 fireEvent.click(screen.getByRole('button', {name:'select visible test comments'}))
 fireEvent.click(screen.getByRole('button', {name:'Mark done'}))
 await screen.findByRole('button', {name:'Undo mark done'})
 expect(fixtures.updateReview).toHaveBeenCalledWith('https://crrt.ai/api','session-token','comment-1','accepted','2026-10-30T10:00:00Z','done')
 fireEvent.click(screen.getByRole('button', {name:'Undo mark done'}))
 await screen.findByText('Previous statuses restored.')
 expect(fixtures.updateReview).toHaveBeenLastCalledWith('https://crrt.ai/api','session-token','comment-1','accepted','2026-10-29T12:00:00.000Z',implementationStatus)
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
 expect(screen.getByTestId('first-claim')).toHaveTextContent(implementationStatus==='unassigned'?'none':'agent-1')
})
it('retains only failed completion items and offers Undo for the successful ones', async () => {
 fixtures.comments = ['comment-1','comment-2'].map(id=>({...readyFeedback(id),reviewStatus:'open',updatedAt:'2026-10-30T10:00:00Z'}))
 fixtures.updateReview.mockRejectedValueOnce(new Error('offline'))
 render(<App />)
 fireEvent.click(await screen.findByRole('button', {name:'select visible test comments'}))
 fireEvent.click(screen.getByRole('button', {name:'Mark done'}))
 await screen.findByText('1 item could not be updated and remain selected.')
 expect(screen.getByTestId('bulk-state')).toHaveTextContent('bulk:comment-1')
 fireEvent.click(screen.getByRole('button', {name:'Undo mark done'}))
 await screen.findByText('Previous statuses restored.')
 expect(fixtures.updateReview).toHaveBeenLastCalledWith('https://crrt.ai/api','session-token','comment-2','open','2026-10-29T12:00:00.000Z','unassigned')
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
})

it.each(['Reopen','Reject'])('restores previous states and ownership through signed Undo for %s',async action=>{
 fixtures.comments=[{...readyFeedback('comment-1'),implementationStatus:'in_progress',claimedByAgentId:'agent'}]
 fixtures.updateReview.mockResolvedValueOnce({updatedAt:'2026-10-30T12:01:00Z',undoToken:'signed-receipt'})
 render(<App />)
 fireEvent.click(await screen.findByRole('button',{name:'show all'}))
 fireEvent.click(screen.getByRole('button',{name:'select visible test comments'}))
 expect(screen.getByText('Reject keeps linked issues unchanged.')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:action}))
 const undo=await screen.findByRole('button',{name:`Undo ${action.toLowerCase()}`})
 fireEvent.click(undo)
 await screen.findByText('Previous statuses restored.')
 expect(fixtures.updateReview).toHaveBeenLastCalledWith('https://crrt.ai/api','session-token','comment-1','accepted',undefined,undefined,{undoToken:'signed-receipt'})
 expect(screen.getByTestId('first-claim')).toHaveTextContent('agent')
 expect(fixtures.updateImpl).not.toHaveBeenCalled()
})
