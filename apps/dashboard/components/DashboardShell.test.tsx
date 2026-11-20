import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

const quota = vi.hoisted(() => ({ value: null as null | { plan: string; used: number; limit: number; canUpgrade: boolean } }))
vi.mock('../hooks/usePlanQuota', () => ({ usePlanQuota: () => quota.value }))
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./UserMenu', () => ({ UserMenu: () => null }))
import { DashboardShell } from './DashboardShell'
import { route } from '../lib/routes'

const project = { publicKey: 'one', name: 'Project One', slug: 'one', allowedOrigins: [], createdAt: '', updatedAt: '' }
const fn = vi.fn()
type Props = ComponentProps<typeof DashboardShell>
const props: Props = { projects: [], projectsLoading: false, projectsError: null, commentsLoading: false, selectedProject: '', commentCount: 0, setSelectedProject: fn, setStatusFilter: fn, setSelectedCommentId: fn, onNewProject: fn, onOpenCmd: fn, onOpenSettings: fn, settingsActive: false, onOpenExtensionComments: fn, extensionCommentsActive: false, apiBase: '/api', accessToken: 'token', onProjectsChanged: fn, onOpenCommentActivity: fn, theme: 'dark', toggleTheme: fn, user: { id: 'u' } as never, onSignOut: fn, superadmin: false, superAdminActive: false, onOpenSuperAdmin: fn, children: <p>View content</p> }
const shell = (overrides: Partial<Props> = {}) => <DashboardShell {...props} {...overrides} />
const admin = () => screen.getByRole('group', { name: 'Workspace administration' })

beforeEach(() => { fn.mockClear(); quota.value = null })

describe('DashboardShell', () => {
  it('frames the view with the top bar tools and footer', () => {
    render(shell({ agentAction: <button type="button">Agents</button>, footer: <footer>Legend</footer> }))
    expect(screen.getByText('View content')).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Workspace')).toHaveAttribute('aria-current', 'page')
    const audit = screen.getByRole('link', { name: 'Run audit' })
    expect(audit).toHaveAttribute('href', route('/audits/new'))
    expect(screen.getByRole('button', { name: 'Agents' }).compareDocumentPosition(audit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search feedback' }))
    expect(props.onOpenCmd).toHaveBeenCalledOnce()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(props.toggleTheme).toHaveBeenCalled()
  })

  it('offers dark mode from light mode and hides the shortcut hint when shortcuts are off', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'disabled', setItem: vi.fn() })
    try {
      const view = render(shell({ theme: 'light' }))
      expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
      expect(view.container.querySelector('kbd')).toBeNull()
    } finally { vi.unstubAllGlobals() }
  })

  it('selects a project, resets its filters and shows its open count', () => {
    const view = render(shell({ projects: [project], selectedProject: 'one', commentCount: 3 }))
    const item = screen.getByRole('button', { name: /Project One/ })
    expect(item).toHaveAttribute('aria-current', 'page')
    expect(item).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: 'Run audit' })).toHaveAttribute('href', route('/audits/new?project=one'))
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

  it('highlights Inbox instead of the project and disables project search there', () => {
    render(shell({ projects: [project], selectedProject: 'one', extensionCommentsActive: true }))
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Project One' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
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

  it('keeps administration in the sidebar footer with its permissions', () => {
    const view = render(shell({ projects: [project], selectedProject: 'one', settingsActive: true, superadmin: true }))
    expect(within(admin()).getByRole('link', { name: 'Documents' })).toHaveAttribute('href', route('/documents?project=one'))
    expect(within(admin()).getByRole('link', { name: 'MCP connections' })).toHaveAttribute('href', route('/mcp-auth'))
    const settings = within(admin()).getByRole('button', { name: 'Project settings' })
    expect(settings).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Settings')).toBeInTheDocument()
    fireEvent.click(settings)
    expect(props.onOpenSettings).toHaveBeenCalled()
    fireEvent.click(within(admin()).getByRole('button', { name: 'Super admin' }))
    expect(props.onOpenSuperAdmin).toHaveBeenCalled()
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /Project settings|Super admin/ })).toBeNull()
    view.rerender(shell({ projects: [project], selectedProject: 'one', canManageProject: false }))
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Super admin' })).toBeNull()
    view.rerender(shell({ superadmin: true, superAdminActive: true }))
    expect(within(admin()).getByRole('button', { name: 'Super admin' })).toHaveAttribute('aria-current', 'page')
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
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
    for (const name of ['Inbox', 'Recordings', 'Project One', 'Super admin']) fireEvent.click(screen.getByRole('button', { name }))
    expect(onLeaveNewProject).toHaveBeenCalledTimes(4)
    expect(onOpenRecordings).toHaveBeenCalledOnce()
    // Without a leave handler, picking a destination still works.
    view.rerender(shell({ projects: [project], selectedProject: 'one', newProjectActive: true }))
    fn.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(props.onOpenExtensionComments).toHaveBeenCalledOnce()
  })

  it('meters the plan in comments and links billing only for managers', () => {
    quota.value = { plan: 'Pro', used: 120, limit: 500, canUpgrade: true }
    const view = render(shell())
    expect(screen.getByText(/380 of 500 comments left this month/)).toBeInTheDocument()
    expect(within(admin().parentElement!).getByRole('link', { name: /upgrade/i })).toHaveAttribute('href', route('/billing'))
    quota.value = { ...quota.value, canUpgrade: false }
    view.rerender(shell())
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull()
  })
})
