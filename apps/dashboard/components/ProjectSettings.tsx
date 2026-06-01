import { useEffect, useState } from 'react'
import type { Project } from '../api'
import { useProjectSettings } from '../hooks/useProjectSettings'
import { cn } from '../lib/utils'
import { ChevronLeftIcon, TrashIcon } from './icons'
import { Spinner } from './primitives'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface ProjectSettingsProps {
  project: Project
  apiBase: string
  accessToken: string
  currentUserId: string
  onBack: () => void
  onProjectsChanged: () => void
}

export function ProjectSettings({ project, apiBase, accessToken, currentUserId, onBack, onProjectsChanged }: ProjectSettingsProps) {
  const settings = useProjectSettings(apiBase, accessToken, project.publicKey, currentUserId, onProjectsChanged)
  const { members, invites, loading, error, isAdmin } = settings

  const [name, setName] = useState(project.name)
  const [nameBusy, setNameBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Re-sync the name field when switching to a different project.
  useEffect(() => { setName(project.name) }, [project.publicKey, project.name])

  const adminCount = members.filter((m) => m.role === 'admin').length
  const nameChanged = name.trim() !== '' && name.trim() !== project.name

  async function run(action: () => Promise<unknown>, key: string | null) {
    setActionError(null)
    setPendingId(key)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPendingId(null)
    }
  }

  async function saveName() {
    if (!nameChanged) return
    setActionError(null)
    setNameBusy(true)
    try {
      await settings.rename(name.trim())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename project')
    } finally {
      setNameBusy(false)
    }
  }

  const inviteValid = EMAIL_RE.test(inviteEmail.trim().toLowerCase())
  async function sendInvite() {
    if (!inviteValid) return
    setActionError(null)
    setInviteBusy(true)
    try {
      await settings.invite(inviteEmail.trim().toLowerCase())
      setInviteEmail('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviteBusy(false)
    }
  }

  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
  const card = 'rounded-lg border border-border bg-card'

  return (
    <main className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[640px] px-6 py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeftIcon size={14} />
          Back to feedback
        </button>

        <h1 className="text-lg font-bold text-foreground tracking-tight">Project settings</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {isAdmin ? 'Manage details, team, and invites.' : 'You have read-only access to this project.'}
        </p>

        {error && <p className="mt-4 text-[12px] text-status-rejected" role="alert">{error}</p>}
        {actionError && <p className="mt-4 text-[12px] text-status-rejected" role="alert">{actionError}</p>}

        {/* Details */}
        <section className="mt-8">
          <h2 className={sectionTitle}>Details</h2>
          <div className={cn(card, 'mt-3 p-4 space-y-4')}>
            <div>
              <label htmlFor="ps-name" className="block mb-1 text-[11px] font-medium text-muted-foreground">Name</label>
              <div className="flex items-center gap-2">
                <input
                  id="ps-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin || nameBusy}
                  maxLength={80}
                  className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-60"
                  autoComplete="off"
                  spellCheck={false}
                />
                {isAdmin && (
                  <button
                    onClick={saveName}
                    disabled={!nameChanged || nameBusy}
                    className={cn(
                      'px-3 py-2 rounded-md text-xs font-semibold transition-all btn-press shrink-0',
                      nameChanged && !nameBusy ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    {nameBusy ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Public key</span>
              <span className="font-mono text-foreground">{project.publicKey}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">{new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="mt-8">
          <h2 className={sectionTitle}>Team{members.length > 0 && ` (${members.length})`}</h2>
          <div className={cn(card, 'mt-3 divide-y divide-border')}>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner size={16} /></div>
            ) : members.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No members yet.</p>
            ) : (
              members.map((m) => {
                const isSelf = m.userId === currentUserId
                const isLastAdmin = m.role === 'admin' && adminCount <= 1
                const canRemove = isAdmin && !isLastAdmin
                return (
                  <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                      {(m.email ?? '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-foreground truncate">
                        {m.email ?? m.userId}{isSelf && <span className="text-muted-foreground"> (you)</span>}
                      </div>
                    </div>
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      m.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}>
                      {m.role}
                    </span>
                    {canRemove && (
                      <button
                        onClick={() => run(() => settings.removeMember(m.userId), m.userId)}
                        disabled={pendingId === m.userId}
                        aria-label={`Remove ${m.email ?? m.userId}`}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-status-rejected hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        {pendingId === m.userId ? <Spinner size={13} /> : <TrashIcon size={14} />}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {isAdmin && (
            <form
              onSubmit={(e) => { e.preventDefault(); sendInvite() }}
              className="mt-3 flex items-center gap-2"
            >
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                disabled={inviteBusy}
                aria-label="Invite by email"
                className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={!inviteValid || inviteBusy}
                className={cn(
                  'px-3 py-2 rounded-md text-xs font-semibold transition-all btn-press shrink-0',
                  inviteValid && !inviteBusy ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                {inviteBusy ? 'Sending…' : 'Invite'}
              </button>
            </form>
          )}
        </section>

        {/* Pending invites */}
        {isAdmin && invites.length > 0 && (
          <section className="mt-8">
            <h2 className={sectionTitle}>Pending invites ({invites.length})</h2>
            <div className={cn(card, 'mt-3 divide-y divide-border')}>
              {invites.map((inv) => (
                <div key={inv.email} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-foreground truncate">{inv.email}</div>
                    <div className="text-[11px] text-muted-foreground">invited as {inv.role}</div>
                  </div>
                  <button
                    onClick={() => run(() => settings.cancelInvite(inv.email), inv.email)}
                    disabled={pendingId === inv.email}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {pendingId === inv.email ? 'Canceling…' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
