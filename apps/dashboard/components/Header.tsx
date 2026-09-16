import { SuggestedProjects } from './SuggestedProjects'
import type { User } from '@supabase/supabase-js'
import { cn } from '../lib/utils'
import { asset, landingRoute, route } from '../lib/routes'
import type { Project, ProjectKeyAvailability } from '../api'
import type { StatusFilter } from '../lib/types'
import { MoonIcon, PlusIcon, SearchIcon, SettingsIcon, ShieldIcon, SunIcon } from './icons'
import { Spinner } from './primitives'
import { AddProjectPopover } from './AddProjectPopover'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

interface HeaderProps {
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
}

export function Header({
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
}: HeaderProps) {
  return (
    <>
    <aside className="dashboard-navigation" aria-label="Workspace navigation">
      <a
        href={landingRoute('?stay=1')}
        aria-label="CRRT marketing site"
        className="flex items-center gap-2 mr-2"
      >
        <img
          src={asset('crrt-isologo.png')}
          alt="CRRT"
          width={24}
          height={24}
          className="shrink-0"
          style={{ imageRendering: 'pixelated' }}
        />
        <span
          className="text-foreground"
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 16,
            letterSpacing: '0.06em',
          }}
        >
          CRRT.
        </span>
      </a>

      <div className="dashboard-nav-label">Workspace</div>

      <nav className="dashboard-projects" aria-label="Projects">
        <button onClick={onOpenExtensionComments} aria-pressed={extensionCommentsActive} className={cn('px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap', extensionCommentsActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}>My comments</button>
        {projectsLoading && projects.length === 0 ? (
          <span className="text-xs text-muted-foreground px-2">Loading projects…</span>
        ) : projectsError ? (
          <span className="text-xs text-status-rejected px-2">{projectsError}</span>
        ) : projects.length === 0 ? (
          <span className="text-xs text-muted-foreground px-2">No projects yet</span>
        ) : (
          projects.map((p) => {
            const isActive = !extensionCommentsActive && selectedProject === p.publicKey
            const count = isActive ? commentCount : null
            return (
              <button
                key={p.publicKey}
                aria-pressed={isActive}
                onClick={() => { setSelectedProject(p.publicKey); setStatusFilter('open'); setSelectedCommentId('') }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <span className="truncate" title={p.name}>{p.name}</span>
                {isActive && commentsLoading ? (
                  <span className="ml-1.5 inline-flex items-center">
                    <Spinner size={11} strokeWidth={3} className="" />
                  </span>
                ) : count !== null && count > 0 ? (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })
        )}

        <button
          type="button"
          onClick={() => setAddProjectOpen((v) => !v)}
          aria-label="Add project"
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground transition-colors shrink-0',
            addProjectOpen
              ? 'bg-accent text-foreground'
              : 'hover:bg-accent hover:text-foreground',
          )}
          title="Add project"
        >
          <PlusIcon size={14} />
        </button>
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
      </nav>

      <nav className="dashboard-navigation-footer" aria-label="Workspace administration">
        {!extensionCommentsActive && selectedProject && canManageProject && (
          <button type="button" onClick={onOpenSettings} aria-label="Project settings" aria-pressed={settingsActive} className={cn('dashboard-navigation-action', settingsActive && 'bg-accent text-foreground')}>
            <SettingsIcon size={16} />
            <span>Project settings</span>
          </button>
        )}
        {superadmin && (
          <button type="button" onClick={onOpenSuperAdmin} aria-pressed={superAdminActive} className={cn('dashboard-navigation-action', superAdminActive && 'bg-accent text-foreground')}>
            <ShieldIcon size={16} />
            <span>Super admin</span>
          </button>
        )}
      </nav>
    </aside>
    <header className="dashboard-toolbar">
      <h1 className="text-base font-medium tracking-tight">Workspace</h1>
      <div className="dashboard-tools">
        <a href={route('/audits/new')} className="inline-flex px-3 py-1.5 rounded-md border border-border text-muted-foreground text-xs font-semibold hover:opacity-90 transition-opacity">Run audit</a>
        <button
          type="button"
          onClick={onOpenCmd}
          aria-label="Search feedback"
          disabled={extensionCommentsActive}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-muted-foreground text-xs w-9 sm:w-52 hover:border-muted-foreground/30 hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SearchIcon />
          <span className="hidden sm:block flex-1 text-left">Search Feedback…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-card text-[10px] font-mono text-muted-foreground">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>
        <NotificationBell
          apiBase={apiBase}
          accessToken={accessToken}
          userId={user.id}
          onProjectsChanged={onProjectsChanged}
          onOpenCommentActivity={onOpenCommentActivity}
        />
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
    </>
  )
}
