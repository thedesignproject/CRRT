import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

const quota = vi.hoisted(() => ({ value: null as null | { plan: string; used: number; limit: number; canUpgrade: boolean } }))
vi.mock('../hooks/usePlanQuota', () => ({ usePlanQuota: () => quota.value }))
const workspace = vi.hoisted(() => ({ name: null as string | null, rename: vi.fn() }))
vi.mock('../hooks/useWorkspace', () => ({ useWorkspace: () => workspace }))
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
const menu = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('./UserMenu', () => ({ UserMenu: (p: Record<string, unknown>) => { menu.props = p; return null } }))
import { DashboardShell } from './DashboardShell'
import { route } from '../lib/routes'

const project = { publicKey: 'one', name: 'Project One', slug: 'one', allowedOrigins: [], createdAt: '', updatedAt: '' }
const fn = vi.fn()
type Props = ComponentProps<typeof DashboardShell>
const props: Props = { projects: [], projectsLoading: false, projectsError: null, commentsLoading: false, selectedProject: '', commentCount: 0, setSelectedProject: fn, setStatusFilter: fn, setSelectedCommentId: fn, onNewProject: fn, onOpenCmd: fn, onOpenSettings: fn, settingsActive: false, onOpenExtensionComments: fn, extensionCommentsActive: false, apiBase: '/api', accessToken: 'token', onProjectsChanged: fn, onOpenCommentActivity: fn, theme: 'dark', toggleTheme: fn, user: { id: 'u' } as never, onSignOut: fn, superadmin: false, superAdminActive: false, onOpenSuperAdmin: fn, children: <p>View content</p> }
const shell = (overrides: Partial<Props> = {}) => <DashboardShell {...props} {...overrides} />

beforeEach(() => { fn.mockClear(); quota.value = null; menu.props = null; workspace.name = null })

describe('DashboardShell', () => {
  it('keeps the top bar to search, the primary action and the account menu', () => {
    render(shell({ agentAction: <button type="button">Agents</button>, footer: <footer>Legend</footer> }))
    expect(screen.getByText('View content')).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Workspace')).toHaveAttribute('aria-current', 'page')
    const search = screen.getByRole('button', { name: 'Search feedback' })
    expect(search.compareDocumentPosition(screen.getByRole('button', { name: 'Agents' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(search)
    expect(props.onOpenCmd).toHaveBeenCalledOnce()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    for (const name of ['Run audit', 'Documents', 'MCP connections']) expect(screen.queryByRole('link', { name })).toBeNull()
    expect(screen.queryByRole('button', { name: /Switch to|Super admin/ })).toBeNull()
    expect(menu.props).toMatchObject({ theme: 'dark', toggleTheme: props.toggleTheme, auditHref: route('/audits/new'), documentsHref: route('/documents'), onOpenSuperAdmin: undefined })
  })

  it('hides the shortcut hint when shortcuts are off', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'disabled', setItem: vi.fn() })
    try {
      const view = render(shell({ theme: 'light' }))
      expect(view.container.querySelector('kbd')).toBeNull()
      expect(menu.props).toMatchObject({ theme: 'light' })
    } finally { vi.unstubAllGlobals() }
  })

  it('selects a project, resets its filters and shows its open count', () => {
    const view = render(shell({ projects: [project], selectedProject: 'one', commentCount: 3 }))
    const item = screen.getByRole('button', { name: /Project One/ })
    expect(item).toHaveAttribute('aria-current', 'page')
    expect(item).toHaveTextContent('3')
    expect(menu.props).toMatchObject({ auditHref: route('/audits/new?project=one'), documentsHref: route('/documents?project=one') })
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Project One')).toBeInTheDocument()
    fireEvent.click(item)
    expect(fn).toHaveBeenNthCalledWith(1, 'one')
    expect(fn).toHaveBeenNthCalledWith(2, 'open')
    expect(fn).toHaveBeenNthCalledWith(3, '')
    view.rerender(shell({ projects: [project], selectedProject: 'one', commentCount: 3, commentsLoading: true }))
    expect(screen.getByRole('button', { name: 'Project One' })).toHaveTextContent(/^Project One$/)
    view.rerender(shell({ projects: [project], selectedProject: 'one', commentCount: 0 }))
    expect(screen.getByRole('button', { name: 'Project One' })).toHaveTextContent(/^Project One$/)
  })

  it('names the workspace and lets the account menu rename it', () => {
    const view = render(shell())
    expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByText('CRRT')).toBeInTheDocument()
    workspace.name = 'Acme Studio'
    view.rerender(shell({ theme: 'light' }))
    expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByText('Acme Studio')).toBeInTheDocument()
    expect(menu.props).toMatchObject({ workspace: { name: 'Acme Studio', onRename: workspace.rename } })
  })

  it('shows each project\'s open count and live agent from the server', () => {
    const other = { ...project, publicKey: 'two', name: 'Project Two' }
    render(shell({ projects: [{ ...project, openCount: 4, agentLive: true }, { ...other, openCount: 0 }], selectedProject: 'two', commentCount: 3 }))
    const one = screen.getByRole('button', { name: /Project One/ })
    expect(one).toHaveTextContent('4')
    expect(within(one).getByText('Agent working')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Project Two' })).toHaveTextContent(/^Project Two$/)
  })

  it('highlights Inbox instead of the project and disables project search there', () => {
    render(shell({ projects: [project], selectedProject: 'one', extensionCommentsActive: true }))
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Project One' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Search feedback' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(props.onOpenExtensionComments).toHaveBeenCalled()
  })

  it('shows Recordings only with a launcher', () => {
    const onOpenRecordings = vi.fn()
    const view = render(shell())
    expect(screen.queryByRole('button', { name: 'Recordings' })).toBeNull()
    view.rerender(shell({ onOpenRecordings, recordingsActive: true }))
    const recordings = screen.getByRole('button', { name: 'Recordings' })
    expect(recordings).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Recordings')).toBeInTheDocument()
    fireEvent.click(recordings)
    expect(onOpenRecordings).toHaveBeenCalledOnce()
  })

  it('adds Next steps and Agent runs for a project with Agents', () => {
    const onOpenNextSteps = vi.fn(); const onOpenAgentRuns = vi.fn()
    const agentNav = { readyCount: 3, live: true, active: 'next-steps' as const, onOpenNextSteps, onOpenAgentRuns }
    const view = render(shell({ projects: [project], selectedProject: 'one', agentNav }))
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Next steps')).toBeInTheDocument()
    const next = screen.getByRole('button', { name: /^Next steps/ })
    expect(next).toHaveAttribute('aria-current', 'page')
    expect(next).toHaveTextContent('3')
    fireEvent.click(next)
    expect(onOpenNextSteps).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /^Agent runs/ }))
    expect(onOpenAgentRuns).toHaveBeenCalledOnce()
    view.rerender(shell({ projects: [project], selectedProject: 'one', agentNav: { ...agentNav, readyCount: 0, live: false, active: 'agent-runs' } }))
    expect(screen.getByRole('button', { name: /^Agent runs/ })).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Agent runs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Next steps/ })).not.toHaveTextContent(/\d/)
    view.rerender(shell({ projects: [project], selectedProject: 'one' }))
    expect(screen.queryByRole('button', { name: /^Next steps/ })).toBeNull()
  })

  it('shows Brain as a workspace page', () => {
    const onOpenBrain = vi.fn()
    const view = render(shell({ projects: [project], selectedProject: 'one' }))
    expect(screen.queryByRole('button', { name: 'Brain' })).toBeNull()
    view.rerender(shell({ projects: [project], selectedProject: 'one', onOpenBrain, brainActive: true }))
    const brain = screen.getByRole('button', { name: 'Brain' })
    expect(brain).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Brain')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).queryByText('Project One')).toBeNull()
    fireEvent.click(brain)
    expect(onOpenBrain).toHaveBeenCalledOnce()
  })

  it('shows project Settings in the workspace nav and super admin in the account menu', () => {
    const view = render(shell({ projects: [project], selectedProject: 'one', settingsActive: true, superadmin: true }))
    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Settings')).toBeInTheDocument()
    fireEvent.click(settings)
    expect(props.onOpenSettings).toHaveBeenCalled()
    ;(menu.props!.onOpenSuperAdmin as () => void)()
    expect(props.onOpenSuperAdmin).toHaveBeenCalled()
    view.rerender(shell({ projects: [project], selectedProject: 'one', canManageProject: false }))
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    expect(menu.props!.onOpenSuperAdmin).toBeUndefined()
    view.rerender(shell({ projects: [project], selectedProject: 'missing' }))
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    view.rerender(shell({ superadmin: true, superAdminActive: true }))
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Super admin')).toBeInTheDocument()
  })

  it.each([
    [{ projectsLoading: true }, 'Loading projects…'],
    [{ projectsError: 'Projects failed' }, 'Projects failed'],
    [{}, 'No projects yet'],
  ] as const)('explains an empty project list %#', (overrides, text) => {
    render(shell(overrides))
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('opens New project and leaves it from any destination', () => {
    const onLeaveNewProject = vi.fn()
    const onOpenRecordings = vi.fn()
    const view = render(shell({ projects: [project], selectedProject: 'one', superadmin: true, onOpenRecordings }))
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(props.onNewProject).toHaveBeenCalledOnce()
    view.rerender(shell({ projects: [project], selectedProject: 'one', superadmin: true, onOpenRecordings, newProjectActive: true, onLeaveNewProject }))
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('New project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Project One' })).not.toHaveAttribute('aria-current')
    for (const name of ['Inbox', 'Recordings', 'Project One', 'Settings']) fireEvent.click(screen.getByRole('button', { name }))
    ;(menu.props!.onOpenSuperAdmin as () => void)()
    expect(onLeaveNewProject).toHaveBeenCalledTimes(5)
    expect(onOpenRecordings).toHaveBeenCalledOnce()
    // Without a leave handler, picking a destination still works.
    view.rerender(shell({ projects: [project], selectedProject: 'one', newProjectActive: true }))
    fn.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(props.onOpenExtensionComments).toHaveBeenCalledOnce()
  })

  it('meters the plan in the top bar and links billing only for managers', () => {
    quota.value = { plan: 'Pro', used: 120, limit: 500, canUpgrade: true }
    const view = render(shell())
    expect(within(screen.getByRole('banner')).getByText(/380 of 500 comments left this month/)).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('link', { name: /upgrade/i })).toHaveAttribute('href', route('/billing'))
    quota.value = { ...quota.value, canUpgrade: false }
    view.rerender(shell())
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull()
  })
})
