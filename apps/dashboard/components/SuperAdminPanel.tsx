import { useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import { timeAgo } from '../lib/format'
import { useAdminData } from '../hooks/useAdminData'
import { ShieldIcon, XIcon } from './icons'
import { Spinner } from './primitives'

interface SuperAdminPanelProps {
  apiBase: string
  accessToken: string
}

const SECTION_HEADER = 'px-4 pt-4 pb-2.5 border-b border-border'
const CRT_LABEL = { fontFamily: 'var(--crrt-font-crt)', fontSize: 11, letterSpacing: '0.08em' } as const

function ColumnState({ loading, error, empty, emptyLabel }: { loading: boolean; error: string | null; empty: boolean; emptyLabel: string }) {
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
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <p className="text-sm font-semibold text-status-rejected mb-1">Failed to load</p>
        <p className="text-xs text-muted-foreground">{error}</p>
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

export function SuperAdminPanel({ apiBase, accessToken }: SuperAdminPanelProps) {
  const { users, projects, loading, error } = useAdminData(apiBase, accessToken)

  // Click a user to scope the projects column to the ones they own (their
  // email appears in a project's owners). Click again, or hit the clear chip,
  // to drop the filter.
  const [filterEmail, setFilterEmail] = useState<string | null>(null)

  const filteredProjects = useMemo(
    () => (filterEmail ? projects.filter((p) => p.owners.includes(filterEmail)) : projects),
    [projects, filterEmail],
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-5 h-11 shrink-0 border-b border-border bg-card">
        <ShieldIcon size={14} className="text-primary" />
        <span className="text-foreground" style={CRT_LABEL}>SUPER ADMIN</span>
        <span className="text-[11px] text-muted-foreground ml-2">
          {users.length} users · {projects.length} projects with comments
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Users — newest first */}
        <div className="w-[380px] shrink-0 flex flex-col border-r border-border bg-card">
          <div className={SECTION_HEADER}>
            <h2 className="text-base font-bold text-foreground tracking-tight">Users</h2>
            <p className="text-[11px] text-muted-foreground">Newest first</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ColumnState loading={loading} error={error} empty={users.length === 0} emptyLabel="No users yet." />
            {!loading && !error && users.map((u) => {
              const active = u.email !== null && u.email === filterEmail
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={u.email === null}
                  onClick={() => setFilterEmail((cur) => (cur === u.email ? null : u.email))}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-border/50 border-l-[3px] transition-colors',
                    active ? 'border-l-primary bg-white/[0.04]' : 'border-l-transparent',
                    u.email === null ? 'cursor-default' : 'hover:bg-white/[0.02]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-foreground truncate">{u.email ?? u.id}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{timeAgo(u.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {u.projectCount} {u.projectCount === 1 ? 'project' : 'projects'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Projects with comments — latest comment first */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          <div className={SECTION_HEADER}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-foreground tracking-tight">Projects with comments</h2>
              {filterEmail && (
                <button
                  type="button"
                  onClick={() => setFilterEmail(null)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors max-w-[220px]"
                >
                  <span className="truncate">{filterEmail}</span>
                  <XIcon size={11} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {filterEmail ? `${filteredProjects.length} owned by this user` : 'Latest comment first'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ColumnState
              loading={loading}
              error={error}
              empty={filteredProjects.length === 0}
              emptyLabel={filterEmail ? 'This user owns no projects with comments.' : 'No projects have received comments yet.'}
            />
            {!loading && !error && filteredProjects.map((p) => (
              <div key={p.publicKey} className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] font-bold text-foreground truncate">{p.name}</span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                      p.claimed ? 'bg-status-accepted-bg text-status-accepted' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {p.claimed ? 'Claimed' : 'Unclaimed'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="font-mono">{p.publicKey}</span>
                  <span>{p.commentCount} {p.commentCount === 1 ? 'comment' : 'comments'}</span>
                  <span>latest {timeAgo(p.latestCommentAt)}</span>
                </div>
                {p.owners.length > 0 && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                    owners: {p.owners.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
