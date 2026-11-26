import posthog from '../../posthog'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import { getExternalWorkDraft, getProjectTrackers, retryExternalWorkSync, resolvePendingExternalWork, sendExternalWork, type ExternalWorkDraft, type ExternalWorkProvider, type ExternalWorkRecord } from '../api'
import { timeAgo, truncateUrl } from '../lib/format'
import { asset } from '../lib/routes'
import { classifyExternalWorkFailure, externalWorkFailureMessage } from '../lib/external-work-errors'
import type { Comment } from '../lib/types'
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DoneIcon,
  ExternalLinkIcon,
  ImageOffIcon,
  XIcon,
} from './icons'
import { ActionBtn, Kbd, StatusBadge } from './primitives'
import { ProjectEmptyState } from './ProjectEmptyState'
import { EmptyState, Initials, PinnedPreview } from '@crrt/ui/crrt'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@crrt/ui/components/dropdown-menu'
import { Ellipsis, MousePointer2 } from 'lucide-react'
import { ExternalWorkDialog } from './ExternalWorkDialog'
import { mocksEnabled } from '../lib/mocks'

const providerLabel = (provider: ExternalWorkProvider) =>
  provider === 'github' ? 'GitHub' : provider === 'linear' ? 'Linear' : 'Jira'

function externalWorkRecord(provider: ExternalWorkProvider, value: {
  issueNumber?: number
  issueUrl?: string
  externalId?: string
  externalKey?: string
  externalUrl?: string
  createdAt: string
}) {
  const externalUrl = value.externalUrl ?? value.issueUrl
  const externalId = value.externalId ?? (value.issueNumber ? String(value.issueNumber) : undefined)
  const externalKey = value.externalKey ?? (value.issueNumber ? `#${value.issueNumber}` : undefined)
  if (!externalUrl || !externalId || !externalKey) return null
  return {
    provider,
    externalId,
    externalKey,
    externalUrl,
    lifecycleStatus: 'active',
    closedAt: null,
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
  } satisfies ExternalWorkRecord
}

function lifecycleLabel(status: ExternalWorkRecord['lifecycleStatus']) {
  if (status === 'closing') return ' · Closing…'
  if (status === 'closed') return ' · Closed'
  if (status === 'failed') return ' · Close failed'
  if (status === 'blocked') return ' · Needs attention'
  return ''
}

function safeExternalWorkUrl(work: ExternalWorkRecord) {
  try {
    const url = new URL(work.externalUrl)
    if (url.protocol !== 'https:') return null
    if (work.provider === 'github') {
      return url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/issues\/\d+\/?$/.test(url.pathname) ? url.toString() : null
    }
    if (work.provider === 'linear') {
      return url.hostname === 'linear.app' ? url.toString() : null
    }
    return url.hostname.endsWith('.atlassian.net') && /^\/browse\/[^/]+\/?$/.test(url.pathname) ? url.toString() : null
  } catch {
    return null
  }
}

function preferRememberedWork(server: ExternalWorkRecord, remembered: ExternalWorkRecord) {
  const terminal = (status: ExternalWorkRecord['lifecycleStatus']) => (
    status === 'closed' || status === 'failed' || status === 'blocked'
  )
  if (terminal(server.lifecycleStatus) && !terminal(remembered.lifecycleStatus)) return false
  if (terminal(remembered.lifecycleStatus) && !terminal(server.lifecycleStatus)) return true
  const serverTime = Date.parse(server.updatedAt)
  const rememberedTime = Date.parse(remembered.updatedAt)
  if (Number.isFinite(serverTime) && Number.isFinite(rememberedTime)) return rememberedTime > serverTime
  return remembered.lifecycleStatus !== 'active' || server.lifecycleStatus === 'active'
}

/** Only http(s) page URLs become links; anything else stays plain text. */
function pageHref(pageUrl: string | undefined | null) {
  if (!pageUrl) return undefined
  try {
    const url = new URL(pageUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function syncRemediation(work: ExternalWorkRecord) {
  const provider = providerLabel(work.provider)
  if (work.syncAction === 'reconnect') return `Reconnect ${provider} in Project Settings, then retry.`
  if (work.syncAction === 'check_permissions') return `Grant ${provider} permission to update this issue, then retry.`
  if (work.syncAction === 'check_issue') return `Check that the ${provider} issue still exists and matches this project.`
  if (work.syncAction === 'configure_workflow') return `Configure a usable rejected or canceled workflow state in ${provider}, then retry.`
  return `Resolve the ${provider} issue configuration, then retry.`
}

// Signed screenshot links expire after a few minutes; never leave an empty frame behind.
export function CommentScreenshot({ url, pageUrl, onRetry }: { url: string; pageUrl?: string | null; onRetry?: () => void | Promise<void> }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (failedUrl === url) {
    return (
      <div className="flex items-center gap-3 px-5 py-8" role="status">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-inset ring-border">
          <ImageOffIcon size={16} className="text-text-subtle" />
        </span>
        <div className="flex-1">
          <p className="text-xs font-medium text-text-strong">Screenshot didn’t load</p>
          <p className="text-[11px] text-text-subtle">The secure link may have expired or the connection dropped.</p>
        </div>
        {onRetry && (
          <button type="button" onClick={() => { void onRetry() }} className="text-xs font-medium text-text-strong underline underline-offset-2">
            Reload screenshot
          </button>
        )}
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex justify-center bg-surface-1">
      <img
        src={url}
        alt={pageUrl ? `Screenshot of ${pageUrl}` : 'Feedback screenshot'}
        className="max-w-full max-h-[520px] w-auto h-auto object-contain"
        draggable={false}
        onError={() => setFailedUrl(url)}
      />
    </a>
  )
}

interface CommentDetailProps {
  selectedComment: Comment | null
  selectedProject: string
  commentsLoading: boolean
  commentsError: string | null
  projectComments: Comment[]
  filteredComments: Comment[]
  selectedIdx: number
  goPrev: () => void
  goNext: () => void
  toggleReview: (c: Comment, target: 'accepted' | 'rejected') => void
  handleToggleDone: (id: string) => void
  onVisibilityChange?: (id: string, visibility: 'shared' | 'internal') => void
  apiBase: string
  accessToken: string
  personal?: false
  readOnly?: boolean
  /** Opens Settings at the Storybook source; omitted for people who can't manage it. */
  onConnectStorybook?: () => void
  /** Marks the empty project's Storybook step as done. */
  storybookConnected?: boolean
  /** Opens Project settings, where trackers are connected; omitted for people who can't manage the project. */
  onOpenIntegrations?: () => void
  bodyEditor?: ReactNode
  personalActions?: ReactNode
  /** Fetches fresh signed screenshot links after one fails to load. */
  onScreenshotRetry?: () => void | Promise<void>
}

type PersonalDetailProps = Omit<CommentDetailProps, 'personal' | 'toggleReview' | 'handleToggleDone'> & { personal: true; toggleReview?: never; handleToggleDone?: never }

export function CommentDetail({
  selectedComment,
  selectedProject,
  commentsLoading,
  commentsError,
  projectComments,
  filteredComments,
  selectedIdx,
  goPrev,
  goNext,
  toggleReview,
  handleToggleDone,
  onVisibilityChange,
  onScreenshotRetry,
  apiBase,
  accessToken,
  personal = false,
  readOnly = false,
  onConnectStorybook,
  storybookConnected,
  onOpenIntegrations,
  bodyEditor,
  personalActions,
}: CommentDetailProps | PersonalDetailProps) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const [issueBusy, setIssueBusy] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  // What the person can do about a failed "prepare issue": connect the tracker, or retry.
  const [issueRecovery, setIssueRecovery] = useState<{ kind: 'connect' | 'retry'; provider: ExternalWorkProvider } | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [createdExternalWork, setCreatedExternalWork] = useState<Record<string, ExternalWorkRecord[]>>({})
  const [pendingRecovery, setPendingRecovery] = useState(false)
  const [externalWorkDraft, setExternalWorkDraft] = useState<ExternalWorkDraft | null>(null)
  // Null until known (or when the check fails): the menu then offers every tracker and the send flow explains.
  const [trackers, setTrackers] = useState<Record<ExternalWorkProvider, { connected: boolean }> | null>(null)
  useEffect(() => {
    setTrackers(null)
    // The mock preview has no integrations API; unknown keeps the menu offering every tracker.
    if (readOnly || !selectedProject || mocksEnabled) return
    let current = true
    getProjectTrackers(apiBase, accessToken, selectedProject).then((next) => { if (current) setTrackers(next) }, () => {})
    return () => { current = false }
  }, [apiBase, accessToken, selectedProject, readOnly])
  const issueRequests = useRef(new Map<string, symbol>())
  const syncRequests = useRef(new Set<string>())
  const selectedId = selectedComment?.id ?? null
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const linkedExternalWork = selectedComment ? (() => {
    const byProvider = new Map((selectedComment.externalWork ?? []).map((work) => [work.provider, work]))
    if (selectedComment.githubIssue && !byProvider.has('github')) {
      byProvider.set('github', {
        provider: 'github',
        externalId: String(selectedComment.githubIssue.issueNumber),
        externalKey: `#${selectedComment.githubIssue.issueNumber}`,
        externalUrl: selectedComment.githubIssue.issueUrl,
        lifecycleStatus: 'active',
        closedAt: null,
        createdAt: selectedComment.githubIssue.createdAt,
        updatedAt: selectedComment.githubIssue.createdAt,
      })
    }
    for (const work of createdExternalWork[selectedComment.id] ?? []) {
      const server = byProvider.get(work.provider)
      if (!server || preferRememberedWork(server, work)) byProvider.set(work.provider, work)
    }
    return [...byProvider.values()]
  })() : []

  const rememberExternalWork = (commentId: string, work: ExternalWorkRecord) => {
    setCreatedExternalWork((current) => ({
      ...current,
      [commentId]: [...(current[commentId] ?? []).filter((candidate) => candidate.provider !== work.provider), work],
    }))
  }

  const openExternalWork = (work: ExternalWorkRecord) => {
    const url = safeExternalWorkUrl(work)
    if (!url) {
      setIssueRecovery(null)
      setIssueError(`Could not open the ${providerLabel(work.provider)} issue because its link is invalid.`)
      return
    }
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
  }

  useEffect(() => {
    setIssueBusy(selectedId !== null && issueRequests.current.has(selectedId))
    setIssueError(null)
    setIssueRecovery(null)
    setSyncBusy(selectedId !== null && syncRequests.current.has(selectedId))
    setExternalWorkDraft(null)
  }, [selectedId])

  const selectorContext = selectedComment?.targetType === 'text_range' && selectedComment.anchor
    ? selectedComment.anchor.containerSelector
    : selectedComment?.selector

  const prepareExternalWork = async (comment: Comment, provider: ExternalWorkProvider) => {
    const linked = linkedExternalWork.find((work) => work.provider === provider)
    if (linked) {
      openExternalWork(linked)
      return
    }
    if (comment.reviewStatus === 'rejected' || issueRequests.current.has(comment.id)) return
    const commentId = comment.id
    const request = Symbol(commentId)
    issueRequests.current.set(commentId, request)
    setIssueBusy(true)
    setIssueError(null)
    setIssueRecovery(null)
    try {
      const prepared = await getExternalWorkDraft(apiBase, accessToken, commentId, provider)
      if (!prepared.connected) throw new Error(`${provider}_${prepared.reason ?? 'not_connected'}`)
      if (prepared.existing) {
        const remembered = externalWorkRecord(provider, prepared.existing)
        if (!remembered) throw new Error('missing_external_work_identity')
        rememberExternalWork(commentId, remembered)
        openExternalWork(remembered)
      } else if (selectedIdRef.current === commentId) {
        setExternalWorkDraft(prepared)
      }
    } catch (error) {
      if (selectedIdRef.current === commentId) {
        const failure = classifyExternalWorkFailure(error)
        setIssueError(externalWorkFailureMessage(failure, providerLabel(provider), Boolean(onOpenIntegrations)))
        if (failure === 'unavailable') setIssueRecovery({ kind: 'retry', provider })
        else if ((failure === 'not_connected' || failure === 'revoked') && onOpenIntegrations) setIssueRecovery({ kind: 'connect', provider })
      }
    } finally {
      issueRequests.current.delete(commentId)
      if (selectedIdRef.current === commentId) setIssueBusy(false)
    }
  }

  useEffect(() => { setPendingRecovery(false) }, [selectedId])

  const handleExternalWorkSubmit = async (draft: { title: string; body: string }) => {
    if (!selectedComment || issueBusy || issueRequests.current.has(selectedComment.id)) return
    const commentId = selectedComment.id
    const request = Symbol(commentId)
    issueRequests.current.set(commentId, request)
    setIssueBusy(true)
    setIssueError(null)
    try {
      // This handler is only mounted while a draft exists; request fencing above
      // prevents a stale dialog from dispatching a second submission.
      const provider = externalWorkDraft!.provider
      const result = await sendExternalWork(apiBase, accessToken, commentId, provider, draft)
      const url = result.externalUrl ?? result.issueUrl
      if (!url) throw new Error('missing_external_work_url')
      const remembered = externalWorkRecord(provider, result)
      if (!remembered) throw new Error('missing_external_work_identity')
      rememberExternalWork(commentId, remembered)
      posthog.capture('external_work_created', { provider })
      setExternalWorkDraft(null)
      if (provider !== 'github') openExternalWork(remembered)
    } catch (error) {
      if (selectedIdRef.current === commentId) {
        const pending = error instanceof Error && error.message.includes('recovery_pending')
        setPendingRecovery(pending)
        setIssueError(pending ? 'The previous export needs to be resolved before retrying.' : 'Could not create the external issue. Try again.')
      }
    } finally {
      issueRequests.current.delete(commentId)
      if (selectedIdRef.current === commentId) setIssueBusy(false)
    }
  }

  const handleResolveExternalWork = async () => {
    const commentId = selectedComment!.id
    setIssueBusy(true)
    try {
      await resolvePendingExternalWork(apiBase, accessToken, commentId, externalWorkDraft!.provider)
      if (selectedIdRef.current === commentId) {
        setPendingRecovery(false)
        setExternalWorkDraft(null)
        setIssueError('Pending export resolved. Check for an existing issue before sending again.')
      }
    } catch {
      if (selectedIdRef.current === commentId) setIssueError('Only project admins can resolve an export after its sender confirms it stopped. If it crashed, contact an operator to confirm termination.')
    } finally {
      if (selectedIdRef.current === commentId) setIssueBusy(false)
    }
  }

  const retryExternalWork = async (comment: Comment) => {
    const commentId = comment.id
    if (syncRequests.current.has(commentId)) return
    syncRequests.current.add(commentId)
    setSyncBusy(true)
    setIssueError(null)
    setIssueRecovery(null)
    try {
      const result = await retryExternalWorkSync(apiBase, accessToken, commentId)
      if (selectedIdRef.current === commentId) {
        setCreatedExternalWork((current) => ({ ...current, [commentId]: result.externalWork }))
      }
    } catch {
      if (selectedIdRef.current === commentId) setIssueError('Could not retry closing the linked issues. Try again.')
    } finally {
      syncRequests.current.delete(commentId)
      if (selectedIdRef.current === commentId) setSyncBusy(false)
    }
  }

  return (
    <div className="dashboard-comment-detail flex-1 min-w-0 flex flex-col overflow-hidden bg-surface-0">
      {selectedComment ? (
        <>
          <header className="flex shrink-0 flex-wrap items-start gap-3 border-b border-border px-6 py-4">
            <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-[-0.02em] text-text-strong" title={selectedComment.id}>
                  Comment #{selectedIdx >= 0 ? selectedIdx + 1 : selectedComment.id}
                </h2>
                {!personal && <StatusBadge comment={selectedComment} />}
                {!personal && selectedComment.visibility === 'internal' && (
                  <span className="text-xs font-medium text-text-subtle">Internal</span>
                )}
              </div>
              <p className="truncate font-mono text-xs text-text-subtle" title={selectedComment.pageUrl ?? undefined}>
                {[selectedComment.pageUrl ? truncateUrl(selectedComment.pageUrl) : null, selectorContext, timeAgo(selectedComment.createdAt)].filter(Boolean).join(' · ')}
              </p>
            </div>
            {!personal && readOnly && (
              <span className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-text-subtle ring-1 ring-inset ring-border">
                Shared with project
              </span>
            )}
            {!personal && !readOnly && <div className="flex items-center gap-1">
              <ActionBtn
                active={selectedComment.reviewStatus === 'rejected'}
                ghost
                variant="reject"
                onClick={() => toggleReview!(selectedComment, 'rejected')}
                shortcut="D"
              >
                <XIcon size={14} /> Reject
              </ActionBtn>
              <ActionBtn
                active={selectedComment.reviewStatus === 'accepted' && selectedComment.implementationStatus !== 'done'}
                primary
                variant="accept"
                onClick={() => toggleReview!(selectedComment, 'accepted')}
                shortcut="A"
              >
                <BotIcon size={14} /> Send to Agent
              </ActionBtn>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="More actions"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface-3 hover:text-text-strong data-popup-open:bg-surface-3 data-popup-open:text-text-strong"
                >
                  <Ellipsis size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleToggleDone!(selectedComment.id)}>
                    <DoneIcon size={14} /> {selectedComment.implementationStatus === 'done' ? 'Mark not done' : 'Mark Done'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onVisibilityChange?.(selectedComment.id, selectedComment.visibility === 'internal' ? 'shared' : 'internal')}>
                    {selectedComment.visibility === 'internal' ? 'Share with project' : 'Make internal'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      {selectedComment.reviewStatus === 'rejected' ? 'Send to · reopen to send' : 'Send to'}
                    </DropdownMenuLabel>
                    {(['github', 'linear', 'jira'] as const).map(provider => trackers?.[provider].connected === false ? (
                      onOpenIntegrations ? (
                        <DropdownMenuItem key={provider} onClick={onOpenIntegrations}>
                          <ExternalLinkIcon size={13} /> Connect {providerLabel(provider)}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={provider} disabled>
                          <span className="flex flex-col">
                            <span>{providerLabel(provider)}</span>
                            <span className="text-xs text-text-subtle">Not connected. Ask a project manager.</span>
                          </span>
                        </DropdownMenuItem>
                      )
                    ) : (
                      <DropdownMenuItem
                        key={provider}
                        aria-label={`Send to ${providerLabel(provider)}`}
                        disabled={!selectedProject || selectedComment.reviewStatus === 'rejected' || issueBusy}
                        onClick={() => { void prepareExternalWork(selectedComment, provider) }}
                      >
                        <ExternalLinkIcon size={13} /> {providerLabel(provider)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>}
          </header>

          <div className="dashboard-detail-scroll flex-1 min-h-0 overflow-y-auto">
            <div key={selectedComment.id} className="dashboard-detail-content mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 detail-enter">
              <article className="dashboard-comment-body flex items-start gap-3">
                <Initials name={selectedComment.author} />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 flex items-baseline gap-2">
                    <span className="text-sm font-medium text-text-strong">{selectedComment.author}</span>
                    <span className="text-xs text-text-subtle">{timeAgo(selectedComment.createdAt)}</span>
                  </p>
                  {bodyEditor ?? <p className="text-[15px] leading-relaxed text-text-body whitespace-pre-wrap break-words">
                    {selectedComment.body}
                  </p>}
                  {personal && <p className="mt-2 text-xs text-text-subtle">Pin {selectedComment.x}%, {selectedComment.y}%</p>}
                  {selectedComment.targetType === 'text_range' && selectedComment.anchor ? (
                    <p className="mt-3 rounded-md border-l-2 border-pin bg-surface-2 px-3 py-2 text-[13px] leading-relaxed">
                      <span className="text-text-subtle">{selectedComment.anchor.prefix}</span>
                      <span className="font-medium text-text-strong">{selectedComment.anchor.selectedText}</span>
                      <span className="text-text-subtle">{selectedComment.anchor.suffix}</span>
                    </p>
                  ) : null}
                </div>
              </article>

              {(linkedExternalWork.length > 0 || (issueError && !externalWorkDraft)) && (
                <section aria-label="Linked work" className="flex flex-wrap items-center gap-2">
                  {linkedExternalWork.map((work) => (
                    <ActionBtn key={work.provider} variant="neutral" onClick={() => openExternalWork(work)}>
                      <ExternalLinkIcon size={13} /> Open {providerLabel(work.provider)} {work.externalKey}{lifecycleLabel(work.lifecycleStatus)}
                    </ActionBtn>
                  ))}

                  {selectedComment.reviewStatus === 'rejected' && linkedExternalWork
                    .filter((work) => work.lifecycleStatus === 'blocked')
                    .map((work) => (
                      <span key={`${work.provider}-remediation`} className="text-xs text-status-rejected">
                        {syncRemediation(work)}
                      </span>
                    ))}

                  {selectedComment.reviewStatus === 'rejected' && linkedExternalWork.some((work) => work.lifecycleStatus === 'failed') && (
                    <ActionBtn variant="neutral" disabled={syncBusy} onClick={() => { void retryExternalWork(selectedComment) }}>
                      {syncBusy ? 'Retrying close…' : 'Retry closing'}
                    </ActionBtn>
                  )}

                  {selectedComment.reviewStatus === 'rejected' && linkedExternalWork.some((work) => work.lifecycleStatus === 'blocked') && (
                    <ActionBtn variant="neutral" disabled={syncBusy} onClick={() => { void retryExternalWork(selectedComment) }}>
                      {syncBusy ? 'Retrying close…' : 'Retry after fixing'}
                    </ActionBtn>
                  )}

                  {issueError && !externalWorkDraft && (
                    <span role="alert" className="text-xs text-status-rejected">{issueError}</span>
                  )}

                  {issueError && !externalWorkDraft && issueRecovery?.kind === 'connect' && (
                    <ActionBtn variant="neutral" onClick={onOpenIntegrations!}>
                      Connect {providerLabel(issueRecovery.provider)}
                    </ActionBtn>
                  )}

                  {issueError && !externalWorkDraft && issueRecovery?.kind === 'retry' && (
                    <ActionBtn variant="neutral" disabled={issueBusy} onClick={() => { void prepareExternalWork(selectedComment, issueRecovery.provider) }}>
                      Try again
                    </ActionBtn>
                  )}
                </section>
              )}

              <div className="flex flex-col gap-2">
                <PinnedPreview
                  url={selectedComment.pageUrl ? truncateUrl(selectedComment.pageUrl) : 'Page unknown'}
                  href={pageHref(selectedComment.pageUrl)}
                  pin={selectedIdx + 1}
                >
                  {selectedComment.screenshotUrl ? (
                    <CommentScreenshot url={selectedComment.screenshotUrl} pageUrl={selectedComment.pageUrl} onRetry={onScreenshotRetry} />
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-8">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-inset ring-border">
                        <ImageOffIcon size={16} className="text-text-subtle" />
                      </span>
                      <div>
                        <p className="text-xs font-medium text-text-strong">No screenshot captured</p>
                        {Number.isFinite(selectedComment.x) && Number.isFinite(selectedComment.y) && (
                          <p className="font-mono text-[11px] text-text-subtle">
                            Pin placed at ({selectedComment.x}, {selectedComment.y})
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </PinnedPreview>
              </div>
            </div>
          </div>

          {personal && <div className="dashboard-detail-actions shrink-0 border-t border-border bg-surface-1">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              {personalActions}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={goPrev}
                  aria-label="Previous comment"
                  disabled={selectedIdx <= 0}
                  className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-3 hover:text-text-strong disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeftIcon size={16} />
                </button>
                <span className="font-mono text-xs tabular-nums text-text-subtle">
                  {selectedIdx + 1}/{filteredComments.length}
                </span>
                <button
                  onClick={goNext}
                  aria-label="Next comment"
                  disabled={selectedIdx >= filteredComments.length - 1}
                  className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-3 hover:text-text-strong disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>
            </div>
          </div>}
        </>
      ) : personal && !commentsLoading && !commentsError && projectComments.length === 0 ? (
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="min-h-full flex flex-col items-center justify-center text-center">
            <img src={asset('crrt-isologo.png')} alt="" width={48} height={48} className="mb-4 shrink-0" style={{ imageRendering: 'pixelated' }} />
            <h2 className="text-base font-semibold text-foreground mb-2">Try the CRRT extension</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Comments you leave with the CRRT browser extension will appear here.
            </p>
            <ActionBtn variant="neutral" disabled>Coming soon</ActionBtn>
          </div>
        </div>
      ) : selectedProject && !commentsLoading && !commentsError && projectComments.length === 0 ? (
        <ProjectEmptyState projectId={selectedProject} onConnectStorybook={onConnectStorybook} storybookConnected={storybookConnected} />
      ) : (
        <EmptyState
          className="flex-1 justify-center"
          icon={<MousePointer2 />}
          title={personal ? 'Select an Inbox item' : 'Select a comment'}
          action={!personal && shortcutsEnabled && <span className="flex items-center gap-1.5 font-mono text-xs text-text-subtle">
            <Kbd>J</Kbd><Kbd>K</Kbd> navigate · <Kbd>A</Kbd> send to agent · <Kbd>D</Kbd> reject
          </span>}
        >
          {personal
            ? 'Pick an Inbox item to see its page context and screenshot.'
            : 'See the pinned element, what the agent did and the thread.'}
        </EmptyState>
      )}
      {externalWorkDraft && <ExternalWorkDialog
        key={selectedId}
        provider={externalWorkDraft.provider}
        destination={externalWorkDraft.destination ?? 'GitHub'}
        initialDraft={externalWorkDraft.draft}
        busy={issueBusy}
        error={issueError}
        onCancel={() => { setExternalWorkDraft(null); setPendingRecovery(false); setIssueError(null) }}
        onSubmit={handleExternalWorkSubmit}
        onResolve={pendingRecovery ? handleResolveExternalWork : undefined}
      />}

    </div>
  )
}
