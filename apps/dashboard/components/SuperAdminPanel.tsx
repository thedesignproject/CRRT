import { useMemo, useState, type ReactNode } from 'react'
import type { AdminProject, AdminProjectSort, AdminStats, AdminUser } from '../api'
import { cn } from '../lib/utils'
import { timeAgo } from '../lib/format'
import { useAdminData } from '../hooks/useAdminData'
import { CheckIcon, ChevronDownIcon, ShieldIcon } from './icons'
import { Spinner } from './primitives'

interface SuperAdminPanelProps {
  apiBase: string
  accessToken: string
}

const countFmt = new Intl.NumberFormat('en-US')
const SECTION_HEADER = 'px-4 pt-4 pb-2.5 border-b border-border'
const CRT_LABEL = { fontFamily: 'var(--crrt-font-crt)', fontSize: 11, letterSpacing: '0.08em' } as const
const DAY_MS = 24 * 60 * 60 * 1000
type AdminView = 'overview' | 'accounts' | 'projects' | 'comments' | 'shares'

function count(value: number | null | undefined) {
  return countFmt.format(value ?? 0)
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS))
}

function memberCount(project: AdminProject) {
  return new Set(project.members.map((m) => m.email)).size
}

function potentialScore(project: AdminProject) {
  const recency = Math.max(0, 20 - daysSince(project.lastCommentAt))
  return Math.round(
    project.commentCount * 1.4 +
    project.feedbackShareCount * 8 +
    project.commentedUrlCount * 3 +
    memberCount(project) * 6 +
    project.commentStatusCounts.accepted * 2 +
    project.implementationStatusCounts.done * 1.5 +
    recency -
    project.commentStatusCounts.rejected,
  )
}

function StatTile({ label, value, view, activeView, tone, onClick }: {
  label: string
  value: ReactNode
  view: AdminView
  activeView: AdminView
  tone?: 'hot' | 'live'
  onClick: (view: AdminView) => void
}) {
  const active = activeView === view
  return (
    <button
      type="button"
      onClick={() => onClick(view)}
      className={cn(
        'min-w-0 border-r border-border px-4 py-2.5 text-left transition-colors last:border-r-0',
        'hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active && 'bg-card',
      )}
      aria-pressed={active}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground truncate">{label}</div>
      <div className={cn(
        'mt-1 font-mono text-lg tabular-nums text-foreground truncate',
        tone === 'hot' && active && 'text-primary',
        tone === 'live' && active && 'text-agent-active',
      )}>
        {value}
      </div>
    </button>
  )
}

function StatsStrip({ stats, activeView, onViewChange }: { stats: AdminStats | null; activeView: AdminView; onViewChange: (view: AdminView) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 border-b border-border bg-card">
      <StatTile label="Overview" view="overview" activeView={activeView} onClick={onViewChange} value="View" tone="hot" />
      <StatTile label="Accounts" view="accounts" activeView={activeView} onClick={onViewChange} value={count(stats?.accounts)} />
      <StatTile label="Projects" view="projects" activeView={activeView} onClick={onViewChange} value={count(stats?.projects)} />
      <StatTile label="Comments" view="comments" activeView={activeView} onClick={onViewChange} value={count(stats?.comments)} />
      <StatTile label="Shares" view="shares" activeView={activeView} onClick={onViewChange} value={count(stats?.shares)} />
    </div>
  )
}

function PanelState({ loading, error, empty, emptyLabel }: { loading: boolean; error: string | null; empty: boolean; emptyLabel: string }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
        <Spinner />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8" role="alert">
        <p className="text-sm font-semibold text-status-rejected mb-1">Load failed</p>
        <p className="text-xs text-muted-foreground break-words">{error}</p>
      </div>
    )
  }
  if (empty) {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }
  return null
}

function LoadMore({ visible, busy, onClick, label }: { visible: boolean; busy: boolean; onClick: () => void; label: string }) {
  if (!visible) return null
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full h-8 rounded-md border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-colors"
      >
        {busy ? 'Loading…' : label}
      </button>
    </div>
  )
}

function RoleBadge({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function UserRow({ user, active, onClick }: { user: AdminUser; active: boolean; onClick: () => void }) {
  const adminCount = user.projectsAsAdminCount
  const memberCount = user.projectsAsMemberCount
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border/50 border-l-[3px] transition-colors',
        'hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active ? 'border-l-primary bg-white/[0.04]' : 'border-l-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[13px] font-bold text-foreground truncate">{user.email ?? user.id}</span>
        {user.superAdmin && <RoleBadge active>super</RoleBadge>}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{adminCount} admin</span>
        <span>{memberCount} member</span>
        <span className="ml-auto shrink-0">{user.lastSignInAt ? `seen ${timeAgo(user.lastSignInAt)}` : 'never seen'}</span>
      </div>
    </button>
  )
}

function SortButton({ sort, active, direction, onClick, children }: {
  sort: AdminProjectSort
  active: boolean
  direction: 'asc' | 'desc'
  onClick: (sort: AdminProjectSort) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(sort)}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
        'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
      )}
      aria-pressed={active}
    >
      {children}
      {active && (
        <span aria-hidden="true">
          <ChevronDownIcon size={12} className={direction === 'asc' ? 'rotate-180' : ''} />
        </span>
      )}
    </button>
  )
}

function TinyMetric({ label, value, tone }: { label: string; value: number; tone?: 'ready' | 'done' | 'reject' | 'agent' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
      tone === 'ready' && 'bg-status-accepted-bg text-status-accepted',
      tone === 'done' && 'bg-status-done-bg text-status-done',
      tone === 'reject' && 'bg-status-rejected-bg text-status-rejected',
      tone === 'agent' && 'bg-agent-active/10 text-agent-active',
      !tone && 'bg-muted text-muted-foreground',
    )}>
      <span>{label}</span>
      <span>{count(value)}</span>
    </span>
  )
}

interface IntelligenceSummary {
  loadedComments: number
  pendingComments: number
  readyComments: number
  doneComments: number
  shareLoops: number
  activeProjects: number
  teamProjects: number
  attentionProjects: number
  topProjects: AdminProject[]
  topProject: AdminProject | null
}

function buildIntelligence(projects: AdminProject[]): IntelligenceSummary {
  const loadedComments = projects.reduce((sum, project) => sum + project.commentCount, 0)
  const pendingComments = projects.reduce((sum, project) => sum + project.commentStatusCounts.pending, 0)
  const readyComments = projects.reduce((sum, project) => sum + project.commentStatusCounts.accepted, 0)
  const doneComments = projects.reduce((sum, project) => sum + project.implementationStatusCounts.done, 0)
  const shareLoops = projects.reduce((sum, project) => sum + project.feedbackShareCount, 0)
  const activeProjects = projects.filter((project) => daysSince(project.lastCommentAt) <= 7).length
  const teamProjects = projects.filter((project) => memberCount(project) > 1).length
  const attentionProjects = projects.filter((project) => project.commentStatusCounts.pending >= 10 || project.commentStatusCounts.rejected >= 5).length
  const topProjects = [...projects].sort((a, b) => potentialScore(b) - potentialScore(a)).slice(0, 6)
  return {
    loadedComments,
    pendingComments,
    readyComments,
    doneComments,
    shareLoops,
    activeProjects,
    teamProjects,
    attentionProjects,
    topProjects,
    topProject: topProjects[0] ?? null,
  }
}

function SignalChip({ children, tone }: { children: ReactNode; tone?: 'hot' | 'live' | 'risk' | 'done' }) {
  return (
    <span className={cn(
      'inline-flex border-l pl-2 text-[10px] font-semibold',
      tone === 'hot' && 'border-primary text-primary',
      tone === 'live' && 'border-agent-active text-agent-active',
      tone === 'risk' && 'border-status-rejected text-status-rejected',
      tone === 'done' && 'border-status-done text-status-done',
      !tone && 'border-border text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function ProjectSignals({ project }: { project: AdminProject }) {
  const chips: Array<{ label: string; tone?: 'hot' | 'live' | 'risk' | 'done' }> = []
  if (daysSince(project.lastCommentAt) <= 2) chips.push({ label: 'fresh', tone: 'live' })
  if (memberCount(project) > 1) chips.push({ label: 'team' })
  if (project.feedbackShareCount >= 5) chips.push({ label: 'share loop', tone: 'hot' })
  if (project.commentStatusCounts.pending >= 10) chips.push({ label: 'review load', tone: 'risk' })
  if (project.implementationStatusCounts.done >= 5) chips.push({ label: 'shipping', tone: 'done' })
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.slice(0, 4).map((chip) => (
        <SignalChip key={chip.label} tone={chip.tone}>{chip.label}</SignalChip>
      ))}
    </div>
  )
}

function OverviewView({ summary, stats }: { summary: IntelligenceSummary; stats: AdminStats | null }) {
  const top = summary.topProject
  return (
    <div className="border-b border-border px-5 py-6">
      <div className="max-w-4xl">
        <div className="text-[10px] uppercase tracking-[0.08em] text-primary">Product potential</div>
        <h2 className="mt-2 text-2xl font-bold leading-tight text-foreground text-balance">
          {top ? `${top.name} is strongest signal right now` : 'No signal yet'}
        </h2>
        <p className="mt-2 max-w-2xl text-[12px] leading-5 text-muted-foreground">
          {top
            ? `${count(top.commentCount)} comments, ${count(top.feedbackShareCount)} shares, ${count(memberCount(top))} people, last active ${timeAgo(top.lastCommentAt)}.`
            : 'Load project activity to see product potential.'}
        </p>
      </div>
      <div className="mt-6 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
        <QuietMetric label="Active projects" value={summary.activeProjects} detail="last 7d" tone="live" />
        <QuietMetric label="Team use" value={summary.teamProjects} detail="2+ members" />
        <QuietMetric label="Review load" value={summary.pendingComments} detail="pending" tone={summary.pendingComments > summary.readyComments ? 'risk' : undefined} />
        <QuietMetric label="Signup pull" value={stats?.signups.last7Days ?? 0} detail="last 7d" tone="hot" />
      </div>
    </div>
  )
}

function QuietMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'hot' | 'live' | 'risk' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground truncate">{label}</div>
      <div className={cn(
        'mt-1 font-mono text-xl tabular-nums text-foreground',
        tone === 'hot' && 'text-primary',
        tone === 'live' && 'text-agent-active',
        tone === 'risk' && 'text-status-rejected',
      )}>
        {count(value)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{detail}</div>
    </div>
  )
}

function ProjectListView({ title, subtitle, projects }: { title: string; subtitle: string; projects: AdminProject[] }) {
  return (
    <div className="border-b border-border px-5 py-5">
      <div className="mb-3">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {projects.length === 0 && (
          <div className="px-1 py-6 text-[12px] text-muted-foreground">No projects.</div>
        )}
        {projects.map((project, index) => (
          <div key={project.publicKey} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-1 py-3">
            <div className="font-mono text-[11px] text-muted-foreground">#{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-foreground">{project.name}</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {count(project.commentCount)} comments · {count(project.feedbackShareCount)} shares · {timeAgo(project.lastCommentAt)}
              </div>
              <ProjectSignals project={project} />
            </div>
            <div className="font-mono text-lg tabular-nums text-primary">{count(potentialScore(project))}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectTable({ projects }: { projects: AdminProject[] }) {
  if (projects.length === 0) return null
  return (
    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left">
      <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <th scope="col" className="border-b border-border px-4 py-2.5 font-semibold">Project</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 font-semibold">Last</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Comments</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Pending</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Ready</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Rejected</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Done</th>
          <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Shares</th>
          <th scope="col" className="border-b border-border px-4 py-2.5 text-right font-semibold">URLs</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => <ProjectTableRow key={project.publicKey} project={project} />)}
      </tbody>
    </table>
  )
}

function ProjectTableRow({ project }: { project: AdminProject }) {
  const owners = project.members.filter((m) => m.role === 'admin').map((m) => m.email)
  return (
    <tr className="group border-b border-border/50 hover:bg-white/[0.02]">
      <td className="border-b border-border/50 px-4 py-3">
        <div className="min-w-0 max-w-[440px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-bold text-foreground">{project.name}</span>
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0',
              project.claimed ? 'bg-status-accepted-bg text-status-accepted' : 'bg-muted text-muted-foreground',
            )}>
              {project.claimed ? 'Claimed' : 'Unclaimed'}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
            <span className="max-w-[160px] truncate font-mono" translate="no">{project.publicKey}</span>
            {owners.length > 0 && <span className="truncate">owner {owners[0]}</span>}
          </div>
        </div>
      </td>
      <td className="border-b border-border/50 px-3 py-3 text-[12px] text-muted-foreground tabular-nums">{timeAgo(project.lastCommentAt)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-foreground tabular-nums">{count(project.commentCount)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-muted-foreground tabular-nums">{count(project.commentStatusCounts.pending)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-status-accepted tabular-nums">{count(project.commentStatusCounts.accepted)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-status-rejected tabular-nums">{count(project.commentStatusCounts.rejected)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-status-done tabular-nums">{count(project.implementationStatusCounts.done)}</td>
      <td className="border-b border-border/50 px-3 py-3 text-right text-[12px] text-agent-active tabular-nums">{count(project.feedbackShareCount)}</td>
      <td className="border-b border-border/50 px-4 py-3 text-right text-[12px] text-muted-foreground tabular-nums">{count(project.commentedUrlCount)}</td>
    </tr>
  )
}

function UserDetail({ user }: { user: AdminUser | null }) {
  if (!user) {
    return (
      <div className="border-t border-border px-4 py-4 text-[11px] text-muted-foreground">
        Select user.
      </div>
    )
  }
  return (
    <div className="border-t border-border px-4 py-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-foreground">{user.email ?? user.id}</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground truncate" translate="no">{user.id}</div>
        </div>
        {user.superAdmin && <RoleBadge active>super</RoleBadge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TinyMetric label="admin" value={user.projectsAsAdminCount} />
        <TinyMetric label="member" value={user.projectsAsMemberCount} />
      </div>
      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">
            <CheckIcon size={12} />
          </span>
          <span>{user.emailConfirmedAt ? `confirmed ${timeAgo(user.emailConfirmedAt)}` : 'email unconfirmed'}</span>
        </div>
        <div>{user.lastSignInAt ? `last sign in ${timeAgo(user.lastSignInAt)}` : 'no sign in'}</div>
        <div>joined {timeAgo(user.createdAt)}</div>
      </div>
    </div>
  )
}

function UsersView({
  users,
  filteredUsers,
  selectedUser,
  selectedUserId,
  query,
  usersHasMore,
  loadingMore,
  onQueryChange,
  onSelectUser,
  onLoadMore,
}: {
  users: AdminUser[]
  filteredUsers: AdminUser[]
  selectedUser: AdminUser | null
  selectedUserId: string | null
  query: string
  usersHasMore: boolean
  loadingMore: boolean
  onQueryChange: (query: string) => void
  onSelectUser: (id: string) => void
  onLoadMore: () => void
}) {
  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 border-r border-border">
        <div className={SECTION_HEADER}>
          <h2 className="text-base font-bold text-foreground tracking-tight">Users</h2>
          <p className="text-[11px] text-muted-foreground">
            {count(filteredUsers.length)} shown · {count(users.length)} loaded
          </p>
          <input
            aria-label="Search users"
            name="admin-user-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search email…"
            className="mt-3 h-8 w-full rounded-md border border-border bg-background px-3 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <PanelState loading={false} error={null} empty={filteredUsers.length === 0} emptyLabel={users.length === 0 ? 'No users yet.' : 'No users match.'} />
          {filteredUsers.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              active={user.id === selectedUserId}
              onClick={() => onSelectUser(user.id)}
            />
          ))}
          <LoadMore visible={usersHasMore} busy={loadingMore} onClick={onLoadMore} label="Load more users" />
        </div>
      </div>
      <div className="bg-card">
        <UserDetail user={selectedUser} />
      </div>
    </div>
  )
}

type ProjectFilter = 'all' | 'claimed' | 'unclaimed'

export function SuperAdminPanel({ apiBase, accessToken }: SuperAdminPanelProps) {
  const {
    stats,
    users,
    projects,
    loading,
    usersLoadingMore,
    projectsLoadingMore,
    error,
    usersHasMore,
    projectsHasMore,
    projectSort,
    projectDirection,
    refresh,
    loadMoreUsers,
    loadMoreProjects,
    setProjectSort,
  } = useAdminData(apiBase, accessToken)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [activeView, setActiveView] = useState<AdminView>('overview')

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  )
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) => `${user.email ?? ''} ${user.id}`.toLowerCase().includes(q))
  }, [users, userQuery])
  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    return projects.filter((project) => {
      const matchesStatus =
        projectFilter === 'all' ||
        (projectFilter === 'claimed' && project.claimed) ||
        (projectFilter === 'unclaimed' && !project.claimed)
      if (!matchesStatus) return false
      if (!q) return true
      const owners = project.members.map((m) => m.email).join(' ')
      return `${project.name} ${project.publicKey} ${owners}`.toLowerCase().includes(q)
    })
  }, [projects, projectFilter, projectQuery])
  const intelligence = useMemo(() => buildIntelligence(projects), [projects])
  const topProjects = useMemo(() => [...projects].sort((a, b) => potentialScore(b) - potentialScore(a)).slice(0, 10), [projects])
  const attentionProjects = useMemo(() => (
    [...projects]
      .filter((project) => project.commentStatusCounts.pending >= 10 || project.commentStatusCounts.rejected >= 5)
      .sort((a, b) => (
        (b.commentStatusCounts.pending + b.commentStatusCounts.rejected) -
        (a.commentStatusCounts.pending + a.commentStatusCounts.rejected)
      ))
      .slice(0, 8)
  ), [projects])
  const shareProjects = useMemo(() => (
    [...projects].sort((a, b) => b.feedbackShareCount - a.feedbackShareCount).slice(0, 8)
  ), [projects])

  return (
    <section className="flex flex-col flex-1 overflow-hidden" aria-label="Super admin">
      <div className="flex items-center gap-2 px-5 h-11 shrink-0 border-b border-border bg-card">
        <span aria-hidden="true">
          <ShieldIcon size={14} className="text-primary" />
        </span>
        <button
          type="button"
          onClick={() => setActiveView('overview')}
          className="text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={CRT_LABEL}
        >
          SUPER ADMIN
        </button>
        <span className="text-[11px] text-muted-foreground ml-2">
          {count(stats?.accounts)} accounts · {count(stats?.projects)} projects
        </span>
        <button
          type="button"
          onClick={refresh}
          className="ml-auto h-7 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          Refresh
        </button>
      </div>

      <StatsStrip stats={stats} activeView={activeView} onViewChange={setActiveView} />

      <div className="flex-1 overflow-y-auto bg-background">
        <PanelState loading={loading} error={error} empty={projects.length === 0 && activeView !== 'accounts'} emptyLabel="No projects have comments yet." />
        {!loading && !error && activeView === 'overview' && <OverviewView summary={intelligence} stats={stats} />}
        {!loading && !error && activeView === 'accounts' && (
          <UsersView
            users={users}
            filteredUsers={filteredUsers}
            selectedUser={selectedUser}
            selectedUserId={selectedUserId}
            query={userQuery}
            usersHasMore={usersHasMore}
            loadingMore={usersLoadingMore}
            onQueryChange={setUserQuery}
            onSelectUser={(id) => setSelectedUserId((current) => (current === id ? null : id))}
            onLoadMore={loadMoreUsers}
          />
        )}
        {!loading && !error && activeView === 'projects' && (
          <ProjectListView
            title="Projects"
            subtitle="ranked by product signal"
            projects={topProjects}
          />
        )}
        {!loading && !error && activeView === 'comments' && (
          <ProjectListView
            title="Comment Load"
            subtitle="highest pending or rejected volume"
            projects={attentionProjects}
          />
        )}
        {!loading && !error && activeView === 'shares' && (
          <ProjectListView
            title="Share Loops"
            subtitle="projects with strongest feedback sharing"
            projects={shareProjects}
          />
        )}
      </div>
    </section>
  )
}
