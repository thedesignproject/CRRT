import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { Bot, FileText, Inbox, Moon, Search, Settings, Shield, Sun, Video } from 'lucide-react'
import { AppShell, NavList, QuotaMeter, TopBar, type NavItem } from '@crrt/ui/crrt'
import { Kbd } from '@crrt/ui/components/kbd'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import type { Project, ProjectKeyAvailability } from '../api'
import { usePlanQuota } from '../hooks/usePlanQuota'
import { route } from '../lib/routes'
import type { StatusFilter } from '../lib/types'
import { AddProjectPopover } from './AddProjectPopover'
import { NotificationBell } from './NotificationBell'
import { SuggestedProjects } from './SuggestedProjects'
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
  addProjectOpen: boolean
  setAddProjectOpen: (open: boolean | ((v: boolean) => boolean)) => void
  onAddProject: (projectKey: string, name: string) => void
  onCheckAvailability: (key: string) => Promise<ProjectKeyAvailability>
  addProjectBusy: boolean
  addProjectError: string | null
  onOpenCmd: () => void
  onOpenSettings: () => void
  canManageProject?: boolean
  settingsActive: boolean
  onOpenExtensionComments: () => void
  extensionCommentsActive: boolean
  onOpenRecordings?: () => void
  recordingsActive?: boolean
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
const iconToolClass = 'inline-flex size-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-3 hover:text-text-strong [&_svg]:size-4'

/** The Studio frame around every signed-in dashboard view: sidebar, top bar and keyboard legend. */
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
  addProjectOpen,
  setAddProjectOpen,
  onAddProject,
  onCheckAvailability,
  addProjectBusy,
  addProjectError,
  onOpenCmd,
  onOpenSettings,
  canManageProject = true,
  settingsActive,
  onOpenExtensionComments,
  extensionCommentsActive,
  onOpenRecordings,
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
  const project = extensionCommentsActive ? undefined : projects.find((p) => p.publicKey === selectedProject)

  const activeId = extensionCommentsActive ? 'inbox'
    : recordingsActive ? 'recordings'
    : superAdminActive ? 'super-admin'
    : settingsActive ? 'settings'
    : selectedProject

  const nav: NavItem[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox />, onSelect: onOpenExtensionComments },
    ...(onOpenRecordings ? [{ id: 'recordings', label: 'Recordings', icon: <Video />, onSelect: onOpenRecordings }] : []),
  ]

  const projectItems: NavItem[] = projects.map((p) => ({
    id: p.publicKey,
    label: p.name,
    count: p.publicKey === activeId && !commentsLoading && commentCount > 0 ? commentCount : undefined,
    onSelect: () => { setSelectedProject(p.publicKey); setStatusFilter('open'); setSelectedCommentId('') },
  }))

  const admin: NavItem[] = [
    { id: 'documents', label: 'Documents', icon: <FileText />, href: route(`/documents?project=${encodeURIComponent(selectedProject)}`) },
    { id: 'mcp', label: 'MCP connections', icon: <Bot />, href: route('/mcp-auth') },
    ...(project && canManageProject ? [{ id: 'settings', label: 'Project settings', icon: <Settings />, onSelect: onOpenSettings }] : []),
    ...(superadmin ? [{ id: 'super-admin', label: 'Super admin', icon: <Shield />, onSelect: onOpenSuperAdmin }] : []),
  ]

  const crumbs = extensionCommentsActive ? ['Inbox']
    : recordingsActive ? ['Recordings']
    : superAdminActive ? ['Super admin']
    : project ? (settingsActive ? [project.name, 'Settings'] : [project.name])
    : ['Workspace']

  return (
    <AppShell
      className="dashboard-shell md:h-dvh md:overflow-hidden"
      nav={nav}
      projects={projectItems}
      projectsEmpty={projectsLoading ? 'Loading projects…' : projectsError ? <span role="alert">{projectsError}</span> : 'No projects yet'}
      activeId={activeId}
      onNewProject={() => setAddProjectOpen((open) => !open)}
      sidebarFooter={
        <div className="flex flex-col gap-4">
          <nav aria-label="Workspace administration"><NavList items={admin} activeId={activeId} /></nav>
          {quota && (
            <QuotaMeter
              className="px-2"
              plan={quota.plan}
              used={quota.used}
              limit={quota.limit}
              unit="comments"
              period="this month"
              upgradeHref={quota.canUpgrade ? route('/billing') : undefined}
            />
          )}
        </div>
      }
      topBar={
        <TopBar crumbs={crumbs}>
          {agentAction}
          <a href={route(`/audits/new${selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : ''}`)} className={toolClass}>Run audit</a>
          <button type="button" onClick={onOpenCmd} aria-label="Search feedback" disabled={extensionCommentsActive} className={`${toolClass} sm:w-52`}>
            <Search className="size-3.5 text-text-subtle" />
            <span className="hidden flex-1 text-left sm:block">Search feedback…</span>
            {shortcutsEnabled && <Kbd className="hidden bg-surface-4 font-mono sm:inline-flex">⌘K</Kbd>}
          </button>
          <NotificationBell apiBase={apiBase} accessToken={accessToken} userId={user.id} onProjectsChanged={onProjectsChanged} onOpenCommentActivity={onOpenCommentActivity} />
          <button type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className={iconToolClass}>
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
          <UserMenu user={user} onSignOut={onSignOut} apiBase={apiBase} accessToken={accessToken} />
        </TopBar>
      }
    >
      <div className="dashboard-main">{children}</div>
      {footer}
      {addProjectOpen && (
        <AddProjectPopover
          suggestedProjects={<SuggestedProjects apiBase={apiBase} accessToken={accessToken} onProjectsChanged={onProjectsChanged} />}
          onAdd={onAddProject}
          onClose={() => setAddProjectOpen(false)}
          checkAvailability={onCheckAvailability}
          busy={addProjectBusy}
          error={addProjectError}
        />
      )}
    </AppShell>
  )
}
