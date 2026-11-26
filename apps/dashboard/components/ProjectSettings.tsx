import posthog from '../../posthog'
import { ProjectPrivacy } from './ProjectPrivacy'
import { useEffect, useId, useRef, useState } from 'react'
import { AGENT_INSTRUCTIONS_MAX, deleteProject, type Project, type ProjectMember, type ProjectMemberRole } from '../api'
import { ExportProjectFeedback } from './ExportProjectFeedback'
import { useProjectSettings } from '../hooks/useProjectSettings'
import { useStorybookConnected } from '../hooks/useStorybookConnected'
import { cn } from '../lib/utils'
import { ChevronLeftIcon, TrashIcon } from './icons'
import { GitHubRepositorySettings } from './GitHubRepositorySettings'
import { LinearIntegrationSettings } from './LinearIntegrationSettings'
import { JiraIntegrationSettings } from './JiraIntegrationSettings'
import { ProjectDomainAccess } from './ProjectDomainAccess'
import { Spinner } from './primitives'
import { StorybookIntegrationSettings } from './StorybookIntegrationSettings'
import { BookOpen, Globe } from 'lucide-react'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const inputField = 'flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50'

const submitBtn = (enabled: boolean) => cn(
  'px-3 py-2 rounded-md text-xs font-semibold transition-all btn-press shrink-0',
  enabled ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed',
)

interface ProjectSettingsProps {
  project: Project
  apiBase: string
  accessToken: string
  currentUserId: string
  onBack: () => void
  onProjectsChanged: () => void
  /** Open with the Storybook setup expanded, e.g. from the Get started checklist. */
  connectStorybook?: boolean
  /** Runs after the owner deletes the project; the Danger zone shows only when set. */
  onDeleted?: () => void | Promise<void>
}

export function ProjectSettings({ project, apiBase, accessToken, currentUserId, onBack, onProjectsChanged, connectStorybook = false, onDeleted }: ProjectSettingsProps) {
  const settings = useProjectSettings(apiBase, accessToken, project.publicKey, currentUserId, onProjectsChanged)
  const { members, invites, loading, error, isAdmin, isOwner } = settings

  const [name, setName] = useState(project.name)
  const [nameBusy, setNameBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'guest'>('guest')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [domains, setDomains] = useState<string[]>(project.allowedOrigins)
  const [domainInput, setDomainInput] = useState('')
  const [domainBusy, setDomainBusy] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [instructionsBusy, setInstructionsBusy] = useState(false)
  const [transferTarget, setTransferTarget] = useState<ProjectMember | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [storybookOpen, setStorybookOpen] = useState(connectStorybook)
  // What the open panel last reported wins over the check made when Settings opened.
  const [storybookLive, setStorybookLive] = useState<boolean | null>(null)
  const storybookChecked = useStorybookConnected(apiBase, accessToken, project.publicKey, isOwner)
  const storybookConnected = storybookLive ?? storybookChecked
  const storybookPanelId = useId()
  const storybookToggleRef = useRef<HTMLButtonElement | null>(null)
  const storybookFocused = useRef(false)
  const pendingAction = useRef(false)
  const actionSequence = useRef(0)
  const projectKeyRef = useRef(project.publicKey)
  const transferTriggerRef = useRef<HTMLSelectElement | null>(null)
  const teamHeadingRef = useRef<HTMLHeadingElement | null>(null)
  projectKeyRef.current = project.publicKey

  // Opened from the checklist's "Connect Storybook" step: bring the expanded row into view.
  useEffect(() => {
    if (!connectStorybook || !isOwner || storybookFocused.current) return
    storybookFocused.current = true
    storybookToggleRef.current?.scrollIntoView?.({ block: 'center' })
    storybookToggleRef.current?.focus()
  }, [connectStorybook, isOwner])

  // Re-sync the name field when switching to a different project.
  useEffect(() => { setName(project.name) }, [project.publicKey, project.name])
  useEffect(() => { setDomains(project.allowedOrigins) }, [project.publicKey, project.allowedOrigins])
  useEffect(() => {
    actionSequence.current += 1
    pendingAction.current = false
    setPendingId(null)
    setActionError(null)
    setInviteRole('guest')
    setTransferTarget(null)
    transferTriggerRef.current = null
  }, [project.publicKey])
  // Repo config loads async (and re-loads per project): sync when it lands.
  useEffect(() => { setInstructions(settings.repoConfig?.agentInstructions ?? '') }, [project.publicKey, settings.repoConfig])

  const nameChanged = name.trim() !== '' && name.trim() !== project.name

  async function run(action: () => Promise<unknown>, key: string | null) {
    if (pendingAction.current) return false
    pendingAction.current = true
    const sequence = ++actionSequence.current
    const isCurrent = () => actionSequence.current === sequence
    setActionError(null)
    setPendingId(key)
    try {
      await action()
      return isCurrent()
    } catch (err) {
      if (isCurrent()) setActionError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      if (isCurrent()) {
        pendingAction.current = false
        setPendingId(null)
      }
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

  // The server normalizes entries ("https://App.Foo.com/x" → "app.foo.com")
  // and rejects unparseable ones, so the client only checks for non-empty.
  async function saveDomains(next: string[]) {
    const requestedProjectKey = project.publicKey
    const updated = await settings.updateAllowedOrigins(next)
    if (projectKeyRef.current === requestedProjectKey) setDomains(updated.allowedOrigins)
  }

  const domainValid = domainInput.trim() !== ''
  async function addDomain() {
    if (!domainValid || domainBusy) return
    setActionError(null)
    setDomainBusy(true)
    try {
      await saveDomains([...domains, domainInput.trim()])
      setDomainInput('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update allowed domains')
    } finally {
      setDomainBusy(false)
    }
  }

  const instructionsChanged = instructions.trim() !== (settings.repoConfig?.agentInstructions ?? '')
  const instructionsUnavailable = loading || settings.repoConfigError !== null
  async function saveInstructions() {
    setActionError(null)
    setInstructionsBusy(true)
    try {
      await settings.saveAgentInstructions(instructions.trim())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save agent instructions')
    } finally {
      setInstructionsBusy(false)
    }
  }

  const inviteValid = EMAIL_RE.test(inviteEmail.trim().toLowerCase())
  async function sendInvite() {
    if (!inviteValid) return
    setActionError(null)
    setInviteBusy(true)
    try {
      await settings.invite(inviteEmail.trim().toLowerCase(), inviteRole)
      posthog.capture('project_invite_sent', { role: inviteRole })
      setInviteEmail('')
      setInviteRole('guest')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviteBusy(false)
    }
  }

  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
  const card = 'rounded-lg border border-border bg-card'

  function requestRoleChange(member: ProjectMember, role: ProjectMemberRole, trigger: HTMLSelectElement) {
    if (role === 'owner') {
      transferTriggerRef.current = trigger
      setTransferTarget(member)
    }
    else void run(() => settings.changeRole(member.userId, role), member.userId)
  }

  function closeOwnershipTransfer() {
    const trigger = transferTriggerRef.current
    setTransferTarget(null)
    transferTriggerRef.current = null
    setTimeout(() => {
      if (trigger?.isConnected) trigger.focus()
      else teamHeadingRef.current?.focus()
    }, 0)
  }

  async function removeProject() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      await deleteProject(apiBase, accessToken, project.publicKey)
      await onDeleted!()
    } catch (err) {
      setDeleteError((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmOwnershipTransfer(target: ProjectMember) {
    const transferred = await run(
      () => settings.changeRole(target.userId, 'owner'),
      target.userId,
    )
    if (transferred) closeOwnershipTransfer()
  }

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

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text-strong">Settings</h1>
          <p className="text-sm text-text-subtle">
            Project ID <span className="font-mono text-text-body">{project.publicKey}</span>
            {!isAdmin && ' · You have read-only access to this project.'}
          </p>
        </header>

        <ExportProjectFeedback apiBase={apiBase} accessToken={accessToken} projectKey={project.publicKey} />

        {error && <p className="mt-4 text-[12px] text-status-rejected" role="alert">{error}</p>}
        {actionError && <p className="mt-4 text-[12px] text-status-rejected" role="alert">{actionError}</p>}

        {isAdmin && <ProjectDomainAccess key={`domains:${project.publicKey}`} apiBase={apiBase} accessToken={accessToken} projectKey={project.publicKey} onMembersChanged={settings.refresh} />}

        {/* Where feedback comes from: the app is required, Storybook is an optional extra. */}
        <section className="mt-8" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className={sectionTitle}>Where feedback comes from</h2>
          <div className="mt-3 divide-y divide-border border-y border-border">
            <div className="flex flex-col gap-3 px-5 py-3.5">
              <div className="flex items-start gap-3">
                <Globe aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-strong">Your app</p>
                  <p className="text-xs text-text-subtle">
                    Allowed domains{domains.length > 0 && ` (${domains.length})`}. Feedback is only accepted from pages on these domains (subdomains included). Leave the list empty to accept feedback from anywhere.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-border rounded-lg ring-1 ring-border">
                {domains.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                    No restrictions — feedback is accepted from any domain.
                  </p>
                ) : (
                  domains.map((domain) => (
                    <div key={domain} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 min-w-0 font-mono text-[13px] text-foreground truncate">{domain}</span>
                      {isAdmin && (
                        <button
                          onClick={() => run(() => saveDomains(domains.filter((d) => d !== domain)), domain)}
                          disabled={pendingId === domain || domainBusy}
                          aria-label={`Remove ${domain}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-status-rejected hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {pendingId === domain ? <Spinner size={13} /> : <TrashIcon size={14} />}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {isAdmin && (
                <form
                  onSubmit={(e) => { e.preventDefault(); addDomain() }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com"
                    disabled={domainBusy}
                    aria-label="Add allowed domain"
                    className={inputField}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={!domainValid || domainBusy}
                    className={submitBtn(domainValid && !domainBusy)}
                  >
                    {domainBusy ? 'Saving…' : 'Add'}
                  </button>
                </form>
              )}
            </div>
            {isOwner && (
              <div className="flex flex-col gap-3 px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <BookOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-strong">
                      Storybook{' '}
                      {storybookConnected
                        ? <span className="ml-1 text-xs font-normal text-status-accepted">Connected</span>
                        : <span className="ml-1 text-xs font-normal text-text-subtle">Optional</span>}
                    </p>
                    <p className="text-xs text-text-subtle">Review components and send story feedback into this project, next to your app’s.</p>
                  </div>
                  <button
                    ref={storybookToggleRef}
                    type="button"
                    aria-expanded={storybookOpen}
                    aria-controls={storybookPanelId}
                    onClick={() => setStorybookOpen((open) => !open)}
                    className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-strong hover:bg-accent"
                  >
                    {storybookOpen ? 'Close' : storybookConnected ? 'Manage Storybook' : '+ Connect Storybook'}
                  </button>
                </div>
                <div id={storybookPanelId} hidden={!storybookOpen}>
                  {storybookOpen && (
                    <StorybookIntegrationSettings
                      appearance="setup"
                      apiBase={apiBase}
                      accessToken={accessToken}
                      projectKey={project.publicKey}
                      onConnectedChange={setStorybookLive}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

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

        <ProjectPrivacy key={`privacy:${project.publicKey}`} project={project} apiBase={apiBase} accessToken={accessToken} canEdit={isAdmin} onSaved={onProjectsChanged} />
        {isAdmin && (
          <GitHubRepositorySettings
            apiBase={apiBase}
            accessToken={accessToken}
            projectKey={project.publicKey}
          />
        )}

        {isAdmin && <LinearIntegrationSettings apiBase={apiBase} accessToken={accessToken} projectKey={project.publicKey} />}
        {isAdmin && <JiraIntegrationSettings apiBase={apiBase} accessToken={accessToken} projectKey={project.publicKey} />}

        {/* Agent instructions */}
        {isAdmin && (
          <section className="mt-8">
            <h2 className={sectionTitle}>Agent instructions</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Injected into every agent handoff prompt for this project — e.g. &ldquo;Read AGENTS.md first and follow its read order.&rdquo;
            </p>
            {settings.repoConfigError && (
              <p className="mt-2 text-[11px] text-status-rejected" role="alert">
                Agent instructions couldn&rsquo;t be loaded. Refresh to try again.
              </p>
            )}
            <div className={cn(card, 'mt-3 p-4')}>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={instructionsBusy || instructionsUnavailable}
                maxLength={AGENT_INSTRUCTIONS_MAX}
                rows={5}
                placeholder="Read AGENTS.md first and follow its read order before any change."
                aria-label="Agent instructions"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-60 resize-y min-h-[96px]"
                spellCheck={false}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {instructions.length}/{AGENT_INSTRUCTIONS_MAX}
                </span>
                <button
                  onClick={saveInstructions}
                  disabled={!instructionsChanged || instructionsBusy || instructionsUnavailable}
                  className={submitBtn(instructionsChanged && !instructionsBusy && !instructionsUnavailable)}
                >
                  {instructionsBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Team */}
        <section className="mt-8">
          <h2 ref={teamHeadingRef} tabIndex={-1} className={sectionTitle}>Team{members.length > 0 && ` (${members.length})`}</h2>
          <div className={cn(card, 'mt-3 divide-y divide-border')}>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner size={16} /></div>
            ) : members.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No members yet.</p>
            ) : (
              members.map((m) => {
                const isSelf = m.userId === currentUserId
                const isProjectOwner = m.role === 'owner'
                const canRemove = isAdmin && !isProjectOwner
                const label = m.email ?? m.userId
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
                    {isAdmin && !isProjectOwner ? (
                      <select
                        value={m.role}
                        onChange={(event) => requestRoleChange(m, event.target.value as ProjectMemberRole, event.currentTarget)}
                        disabled={pendingId !== null || transferTarget !== null}
                        aria-label={`Role for ${label}`}
                        className="px-2 py-1 rounded-md border border-border bg-background text-[11px] font-semibold text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
                      >
                        <option value="member">member</option>
                        <option value="guest">guest</option>
                        <option value="admin">admin</option>
                        {isOwner && <option value="owner">owner</option>}
                      </select>
                    ) : (
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        m.role !== 'member' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                      )}>
                        {m.role}
                      </span>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => run(() => settings.removeMember(m.userId), m.userId)}
                        disabled={pendingId !== null || transferTarget !== null}
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

          {transferTarget && (
            <div
              role="alertdialog"
              aria-label="Confirm ownership transfer"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && pendingId === null) closeOwnershipTransfer()
              }}
              className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
            >
              <p className="text-[12px] text-foreground">
                Transfer ownership to <span className="font-semibold">{transferTarget.email ?? transferTarget.userId}</span>?
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">You will remain an admin after the transfer.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { void confirmOwnershipTransfer(transferTarget) }}
                  disabled={pendingId !== null}
                  className={submitBtn(pendingId === null)}
                >
                  {pendingId === transferTarget.userId ? 'Transferring…' : 'Transfer ownership'}
                </button>
                <button type="button" onClick={closeOwnershipTransfer} disabled={pendingId !== null} autoFocus className="px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <form
              onSubmit={(e) => { e.preventDefault(); sendInvite() }}
              className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
            >
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                disabled={inviteBusy}
                aria-label="Invite by email"
                className={inputField}
                autoComplete="off"
                spellCheck={false}
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member' | 'guest')}
                disabled={inviteBusy}
                aria-label="Invitation role"
                className="px-3 py-2 rounded-md border border-border bg-background text-xs text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
              >
                <option value="guest">guest — feedback only</option>
                <option value="member">member — review and Agent</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="submit"
                disabled={!inviteValid || inviteBusy}
                className={submitBtn(inviteValid && !inviteBusy)}
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
                    disabled={pendingId !== null}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {pendingId === inv.email ? 'Canceling…' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {isOwner && onDeleted && (
          <section className="mt-8" aria-labelledby="danger-heading">
            <h2 id="danger-heading" className={sectionTitle}>Danger zone</h2>
            <form onSubmit={(e) => { e.preventDefault(); void removeProject() }} className={cn(card, 'mt-3 space-y-3 p-4')}>
              <div>
                <p className="text-[13px] font-medium text-foreground">Delete this project</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Deletes its feedback, members, invites, shares, integrations and Storybook connections for everyone. Recordings and documents are kept, no longer in any project, and so are usage counts. This can&rsquo;t be undone.
                </p>
              </div>
              <label htmlFor="ps-delete" className="block text-[11px] font-medium text-muted-foreground">
                Type <span className="font-semibold text-foreground">{project.name}</span> to confirm
              </label>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <input
                  id="ps-delete"
                  type="text"
                  value={deleteName}
                  onChange={(e) => setDeleteName(e.target.value)}
                  disabled={deleteBusy}
                  className={inputField}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  disabled={deleteName !== project.name || deleteBusy}
                  className="px-3 py-2 rounded-md text-xs font-semibold transition-all btn-press shrink-0 bg-destructive text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteBusy ? 'Deleting…' : 'Delete project'}
                </button>
              </div>
              {deleteError && <p role="alert" className="text-[11px] text-status-rejected">{deleteError}</p>}
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
