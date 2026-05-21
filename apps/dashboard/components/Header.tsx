import type { User } from '@supabase/supabase-js'
import { cn } from '../lib/utils'
import type { Project } from '../api'
import type { StatusFilter } from '../lib/types'
import { MoonIcon, PlusIcon, SearchIcon, SunIcon } from './icons'
import { Spinner } from './primitives'
import { AddProjectPopover } from './AddProjectPopover'
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
  onAddProject: (name: string) => void
  addProjectBusy: boolean
  addProjectError: string | null
  onOpenCmd: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  user: User
  onSignOut: () => void
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
  addProjectBusy,
  addProjectError,
  onOpenCmd,
  theme,
  toggleTheme,
  user,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="flex items-center gap-3 px-5 h-[52px] shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 mr-2">
        <img
          src="/crrt-isologo.png"
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
      </div>

      <div className="w-px h-5 bg-border" />

      <nav className="flex items-center gap-1 flex-1 overflow-auto">
        {projectsLoading && projects.length === 0 ? (
          <span className="text-xs text-muted-foreground px-2">Loading projects…</span>
        ) : projectsError ? (
          <span className="text-xs text-status-rejected px-2">{projectsError}</span>
        ) : projects.length === 0 ? (
          <span className="text-xs text-muted-foreground px-2">No projects yet</span>
        ) : (
          projects.map((p) => {
            const isActive = selectedProject === p.publicKey
            const count = isActive ? commentCount : null
            return (
              <button
                key={p.publicKey}
                onClick={() => { setSelectedProject(p.publicKey); setStatusFilter('all'); setSelectedCommentId('') }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {p.name}
                {isActive && commentsLoading ? (
                  <span className="ml-1.5 inline-flex items-center">
                    <Spinner size={11} strokeWidth={3} className="" />
                  </span>
                ) : count !== null && count > 0 ? (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-primary-foreground">
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })
        )}

        <div data-add-project className="relative">
          <button
            onClick={() => setAddProjectOpen((v) => !v)}
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground transition-all',
              addProjectOpen
                ? 'bg-accent text-foreground'
                : 'hover:bg-accent hover:text-foreground'
            )}
            title="Add project"
          >
            <PlusIcon size={14} />
          </button>
          {addProjectOpen && (
            <AddProjectPopover
              onAdd={onAddProject}
              onClose={() => setAddProjectOpen(false)}
              busy={addProjectBusy}
              error={addProjectError}
            />
          )}
        </div>
      </nav>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-muted-foreground text-xs w-52 hover:border-muted-foreground/30 hover:bg-accent transition-colors cursor-pointer"
        >
          <SearchIcon />
          <span className="flex-1 text-left">Search Feedback...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-card text-[10px] font-mono text-muted-foreground">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>
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
  )
}
