import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { Bot, Brain, Inbox, ListChecks, Search, Settings, Video } from 'lucide-react'
import { AppShell, QuotaMeter, TopBar, type NavItem } from '@crrt/ui/crrt'
import { Kbd } from '@crrt/ui/components/kbd'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import type { Project } from '../api'
import { usePlanQuota } from '../hooks/usePlanQuota'
import { landingRoute, route } from '../lib/routes'
import type { StatusFilter } from '../lib/types'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

interface DashboardShellProps {
  agentAction?: ReactNode
  projects: Project[]
  projectsLoading: boolean
  projectsError: string | null
  commentsLoading: boolean
  selectedProject: string
  commentCount: number
  setSelectedProject: (key: string) => void
  setStatusFilter: (f: StatusFilter) => void
  setSelectedCommentId: (id: string) => void
  /** The New project page is the current view. */
  newProjectActive?: boolean
  onNewProject: () => void
  /** Closes the New project page when another destination is picked. */
  onLeaveNewProject?: () => void
  onOpenCmd: () => void
  onOpenSettings: () => void
  canManageProject?: boolean
  settingsActive: boolean
  /** Next steps and Agent runs for the selected project; absent without agent access. */
  agentNav?: {
    readyCount: number
    live: boolean
    active: 'next-steps' | 'agent-runs' | null
    onOpenNextSteps: () => void
    onOpenAgentRuns: () => void
  }
  onOpenExtensionComments: () => void
  extensionCommentsActive: boolean
  onOpenRecordings?: () => void
  recordingsActive?: boolean
  onOpenBrain?: () => void
  brainActive?: boolean
  apiBase: string
  accessToken: string
  onProjectsChanged: () => void
  onOpenCommentActivity: (payload: { projectKey: string; latestCommentId?: string }) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  user: User
  onSignOut: () => void
  superadmin: boolean
  superAdminActive: boolean
  onOpenSuperAdmin: () => void
  /** Pinned under the content, e.g. the keyboard legend. */
  footer?: ReactNode
  children: ReactNode
}

const toolClass = 'inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium text-text-body ring-1 ring-border transition-colors hover:bg-surface-3 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-50'

/**
 * The Studio frame around every signed-in dashboard view.
 * Sidebar: workspace views, then projects. Top bar: breadcrumb, quota, search,
 * notifications, the screen's one primary action and the account menu, which
 * holds everything administrative.
 */
export function DashboardShell({
  agentAction,
  projects,
  projectsLoading,
  projectsError,
  commentsLoading,
  selectedProject,
  commentCount,
  setSelectedProject,
  setStatusFilter,
  setSelectedCommentId,
  newProjectActive = false,
  onNewProject,
  onLeaveNewProject,
  onOpenCmd,
  onOpenSettings,
  canManageProject = true,
  settingsActive,
  agentNav,
  onOpenExtensionComments,
  extensionCommentsActive,
  onOpenRecordings,
  onOpenBrain,
  brainActive,
  recordingsActive = false,
  apiBase,
  accessToken,
  onProjectsChanged,
  onOpenCommentActivity,
  theme,
  toggleTheme,
  user,
  onSignOut,
  superadmin,
  superAdminActive,
  onOpenSuperAdmin,
  footer,
  children,
}: DashboardShellProps) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const quota = usePlanQuota(apiBase, accessToken, user.id)
  // Picking any destination leaves the New project page.
  const leave = (go: () => void) => () => { onLeaveNewProject?.(); go() }
  const selected = projects.find((p) => p.publicKey === selectedProject)
  // The breadcrumb names the project only on project views; Settings stays reachable while New project is open.
  const project = extensionCommentsActive || newProjectActive ? undefined : selected

  const activeId = newProjectActive ? 'new-project'
    : extensionCommentsActive ? 'inbox'
    : recordingsActive ? 'recordings'
    : brainActive ? 'brain'
    : superAdminActive ? 'super-admin'
    : settingsActive ? 'settings'
    : agentNav?.active ? agentNav.active
    : selectedProject

  const nav: NavItem[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox />, onSelect: leave(onOpenExtensionComments) },
    ...(agentNav ? [
      { id: 'next-steps', label: 'Next steps', icon: <ListChecks />, count: agentNav.readyCount || undefined, onSelect: leave(agentNav.onOpenNextSteps) },
      { id: 'agent-runs', label: 'Agent runs', icon: <Bot />, live: agentNav.live, onSelect: leave(agentNav.onOpenAgentRuns) },
    ] : []),
    ...(onOpenRecordings ? [{ id: 'recordings', label: 'Recordings', icon: <Video />, onSelect: leave(onOpenRecordings) }] : []),
    ...(onOpenBrain ? [{ id: 'brain', label: 'Brain', icon: <Brain />, onSelect: leave(onOpenBrain) }] : []),
    ...(selected && canManageProject ? [{ id: 'settings', label: 'Settings', icon: <Settings />, onSelect: leave(onOpenSettings) }] : []),
  ]

  const projectItems: NavItem[] = projects.map((p) => ({
    id: p.publicKey,
    label: p.name,
    count: p.publicKey === activeId && !commentsLoading && commentCount > 0 ? commentCount : undefined,
    onSelect: leave(() => { setSelectedProject(p.publicKey); setStatusFilter('open'); setSelectedCommentId('') }),
  }))

  const crumbs = newProjectActive ? ['New project']
    : extensionCommentsActive ? ['Inbox']
    : recordingsActive ? ['Recordings']
    : brainActive ? ['Brain']
    : superAdminActive ? ['Super admin']
    : project ? (settingsActive ? [project.name, 'Settings']
      : agentNav?.active === 'next-steps' ? [project.name, 'Next steps']
      : agentNav?.active === 'agent-runs' ? [project.name, 'Agent runs']
      : [project.name])
    : ['Workspace']

  const projectQuery = selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : ''

  return (
    <AppShell
      className="dashboard-shell md:h-dvh md:overflow-hidden"
      homeHref={landingRoute('?stay=1')}
      homeLabel="CRRT marketing site"
      nav={nav}
      projects={projectItems}
      projectsEmpty={projectsLoading ? 'Loading projects…' : projectsError ? <span role="alert">{projectsError}</span> : 'No projects yet'}
      activeId={activeId}
      onNewProject={onNewProject}
      topBar={
        <TopBar crumbs={crumbs}>
          {quota && (
            <QuotaMeter
              plan={quota.plan}
              used={quota.used}
              limit={quota.limit}
              unit="comments"
              period="this month"
              upgradeHref={quota.canUpgrade ? route('/billing') : undefined}
            />
          )}
          <button type="button" onClick={onOpenCmd} aria-label="Search feedback" disabled={extensionCommentsActive} className={`${toolClass} sm:w-52`}>
            <Search className="size-3.5 text-text-subtle" />
            <span className="hidden flex-1 text-left sm:block">Search feedback…</span>
            {shortcutsEnabled && <Kbd className="hidden bg-surface-4 font-mono sm:inline-flex">⌘K</Kbd>}
          </button>
          <NotificationBell apiBase={apiBase} accessToken={accessToken} userId={user.id} onProjectsChanged={onProjectsChanged} onOpenCommentActivity={onOpenCommentActivity} />
          {agentAction}
          <UserMenu
            user={user}
            onSignOut={onSignOut}
            apiBase={apiBase}
            accessToken={accessToken}
            theme={theme}
            toggleTheme={toggleTheme}
            auditHref={route(`/audits/new${projectQuery}`)}
            documentsHref={route(`/documents${projectQuery}`)}
            onOpenSuperAdmin={superadmin ? leave(onOpenSuperAdmin) : undefined}
          />
        </TopBar>
      }
    >
      <div className="dashboard-main">{children}</div>
      {footer}
    </AppShell>
  )
}
