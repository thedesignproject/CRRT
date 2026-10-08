import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Bot, Check, Copy, RefreshCw, X } from 'lucide-react'
import type { WidgetLoginSession } from '../lib/widgetLogin'
import { WidgetRequestError } from '../lib/widgetLogin'
import {
  createWidgetAgentSession,
  fetchWidgetAgentEligibility,
  mutateWidgetFeedback,
  startWidgetAgentUpgrade,
  type WidgetAgentAccessState,
  type WidgetAgentComment,
} from './FeedbackWidget/api'

type Target = 'claude-code' | 'codex' | 'generic'
type AccessView = 'checking' | 'authentication_required' | WidgetAgentAccessState | 'error' | 'handoff'
type ShareSession = { slug: string; token: string }

const TARGETS: Array<{ id: Target; label: string }> = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'generic', label: 'Generic agent' },
]
const EMPTY_PROMPTS: Record<Target, string> = { 'claude-code': '', codex: '', generic: '' }
const WIDGET_ATTR = 'data-fw'

function createIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `widget_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function isDefaultSelection(comment: WidgetAgentComment) {
  return comment.implementationStatus !== 'in_progress' && comment.implementationStatus !== 'ready_for_testing'
}

function canSelect(comment: WidgetAgentComment) {
  return comment.implementationStatus !== 'ready_for_testing' && comment.implementationStatus !== 'done'
}

function statusLabel(comment: WidgetAgentComment) {
  if (comment.implementationStatus !== 'unassigned') return comment.implementationStatus.replace(/_/g, ' ')
  return comment.reviewStatus === 'open' ? 'open' : 'accepted'
}

async function loadPrompts(apiBase: string, share: ShareSession) {
  const entries = await Promise.all(TARGETS.map(async ({ id }) => {
    const url = `${apiBase}/v1/shares/${share.slug}/prompt?token=${encodeURIComponent(share.token)}&target=${id}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Could not load the Agent prompt.')
    const body = await response.json() as { prompt?: unknown }
    if (typeof body.prompt !== 'string') throw new Error('Could not load the Agent prompt.')
    return [id, body.prompt] as const
  }))
  return Object.fromEntries(entries) as Record<Target, string>
}

export interface PremiumAgentBridgeProps {
  apiBase: string
  projectId: string
  pageUrl: string
  widgetSession: WidgetLoginSession | null
  loginBusy?: boolean
  loginError?: string
  onLogin: () => Promise<void>
  onClose: () => void
  onFeedbackChanged?: () => void
}

export function PremiumAgentBridge({
  apiBase,
  projectId,
  pageUrl,
  widgetSession,
  loginBusy = false,
  loginError = '',
  onLogin,
  onClose,
  onFeedbackChanged,
}: PremiumAgentBridgeProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const contextGeneration = useRef(0)
  const requestKey = useRef<{ signature: string; value: string } | null>(null)
  const selectionInitialized = useRef(false)
  const [view, setView] = useState<AccessView>(widgetSession ? 'checking' : 'authentication_required')
  const [comments, setComments] = useState<WidgetAgentComment[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [upgradeUrl, setUpgradeUrl] = useState('')
  const [share, setShare] = useState<ShareSession | null>(null)
  const [prompts, setPrompts] = useState<Record<Target, string>>(EMPTY_PROMPTS)
  const [copied, setCopied] = useState<Target | null>(null)

  const refreshAccess = useCallback(async (preserveSelection = true, silent = false) => {
    const current = ++generation.current
    if (!widgetSession) {
      setView('authentication_required')
      return
    }
    if (!preserveSelection) selectionInitialized.current = false
    if (!silent) setView('checking')
    setMessage('')
    try {
      const result = await fetchWidgetAgentEligibility(apiBase, projectId, pageUrl, widgetSession)
      /* v8 ignore next -- stale async responses are intentionally discarded */
      if (current !== generation.current) return
      setView(result.state)
      if (result.state !== 'ready') return
      setUpgradeUrl('')
      const nextComments = result.comments ?? []
      setComments(nextComments)
      const shouldPreserveSelection = preserveSelection && selectionInitialized.current
      selectionInitialized.current = true
      setSelectedIds((previous) => {
        const next = new Set<string>()
        for (const comment of nextComments) {
          if (!canSelect(comment)) continue
          if (shouldPreserveSelection ? previous.has(comment.id) : isDefaultSelection(comment)) next.add(comment.id)
        }
        return next
      })
    } catch (error) {
      /* v8 ignore next -- stale async failures are intentionally discarded */
      if (current !== generation.current) return
      if (error instanceof WidgetRequestError && error.status === 401) setView('authentication_required')
      else if (!silent) {
        setView('error')
        setMessage(error instanceof Error ? error.message : 'Agent is temporarily unavailable.')
      }
    }
  }, [apiBase, pageUrl, projectId, widgetSession])

  useEffect(() => {
    contextGeneration.current++
    requestKey.current = null
    setBusy(false)
    setCopied(null)
    setShare(null)
    setPrompts(EMPTY_PROMPTS)
    setUpgradeUrl('')
    void refreshAccess(false)
    return () => { generation.current++; contextGeneration.current++ }
  }, [refreshAccess])

  useEffect(() => {
    /* v8 ignore next -- browsers always expose an HTMLElement activeElement here */
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'))
      /* v8 ignore next -- the dialog always renders its close button */
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [onClose])

  useEffect(() => {
    if (!upgradeUrl || view === 'ready') return
    const retry = () => { void refreshAccess(true) }
    window.addEventListener('focus', retry)
    const timer = window.setInterval(retry, 5000)
    return () => { window.removeEventListener('focus', retry); window.clearInterval(timer) }
  }, [refreshAccess, upgradeUrl, view])

  useEffect(() => {
    if (view !== 'ready') return
    const refresh = () => { void refreshAccess(true, true) }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 15000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [refreshAccess, view])


  async function mutate(ids: string[], action: 'accept' | 'reject' | 'resolve') {
    /* v8 ignore next -- callers are hidden/disabled for these states */
    if (!widgetSession || busy) return
    const context = contextGeneration.current
    setBusy(true); setMessage('')
    try {
      await mutateWidgetFeedback(apiBase, { projectKey: projectId, pageUrl, commentIds: ids, action }, widgetSession)
      if (context !== contextGeneration.current) return
      onFeedbackChanged?.()
      await refreshAccess(true)
    } catch (error) {
      if (context !== contextGeneration.current) return
      if (error instanceof WidgetRequestError && error.status === 401) setView('authentication_required')
      setMessage(error instanceof Error ? error.message : 'Could not update feedback.')
    } finally { if (context === contextGeneration.current) setBusy(false) }
  }

  async function confirmHandoff() {
    /* v8 ignore next -- callers are hidden/disabled for these states */
    if (!widgetSession || busy || selectedIds.size === 0) return
    const context = contextGeneration.current
    setBusy(true); setMessage('')
    const signature = [...selectedIds].sort().join(',')
    if (!requestKey.current || requestKey.current.signature !== signature) {
      requestKey.current = { signature, value: createIdempotencyKey() }
    }
    try {
      const created = await createWidgetAgentSession(apiBase, {
        projectKey: projectId,
        pageUrl,
        commentIds: [...selectedIds],
        idempotencyKey: requestKey.current.value,
      }, widgetSession)
      const nextShare = { slug: created.slug, token: created.token }
      if (context !== contextGeneration.current) return
      const nextPrompts = await loadPrompts(apiBase, nextShare)
      if (context !== contextGeneration.current) return
      generation.current++
      setShare(nextShare)
      setPrompts(nextPrompts)
      setView('handoff')
      onFeedbackChanged?.()
    } catch (error) {
      if (context !== contextGeneration.current) return
      if (error instanceof WidgetRequestError) {
        if (error.status === 401) setView('authentication_required')
        else if (['upgrade_required', 'owner_upgrade_required', 'seat_limit_reached', 'forbidden', 'project_access_denied'].includes(error.code ?? '')) {
          setView(error.code as AccessView)
        }
      }
      setMessage(error instanceof Error ? error.message : 'Could not create the Agent handoff.')
    } finally { if (context === contextGeneration.current) setBusy(false) }
  }

  async function beginUpgrade() {
    /* v8 ignore next -- the action is hidden/disabled for these states */
    if (!widgetSession || busy) return
    const popup = window.open('about:blank', '_blank', 'popup,width=720,height=760')
    const context = contextGeneration.current
    setBusy(true); setMessage('')
    try {
      const result = await startWidgetAgentUpgrade(apiBase, { projectKey: projectId, pageUrl }, widgetSession)
      if (context !== contextGeneration.current) { popup?.close(); return }
      setUpgradeUrl(result.url)
      if (popup) popup.location.href = result.url
      else setMessage('Your browser blocked the billing window. Use the link below to continue.')
    } catch (error) {
      popup?.close()
      if (context !== contextGeneration.current) return
      setMessage(error instanceof Error ? error.message : 'Could not open billing.')
    } finally { if (context === contextGeneration.current) setBusy(false) }
  }

  async function copyPrompt(target: Target) {
    const prompt = prompts[target]
    /* v8 ignore next -- prompt buttons remain disabled until content exists */
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(target)
      window.setTimeout(() => setCopied(null), 1600)
    } catch { setMessage('Copy failed. Select the prompt manually and copy it.') }
  }

  const selected = comments.filter((comment) => selectedIds.has(comment.id))
  const openSelected = selected.filter((comment) => comment.reviewStatus === 'open')
  const resolvableSelected = selected.filter((comment) => comment.reviewStatus === 'accepted')

  return (
    <div {...{ [WIDGET_ATTR]: '' }} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div aria-hidden="true" style={overlayStyle} />
      <div ref={dialogRef} data-fw-agent-dialog="premium" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fw-agent-title" aria-describedby="fw-agent-description" style={dialogStyle}>
        <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--fw-contrast-06)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E8853D', color: '#080808', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Bot size={20} aria-hidden="true" /></div>
          <div style={{ flex: 1 }}>
            <h2 id="fw-agent-title" style={{ margin: 0, fontSize: 18, color: 'var(--fw-foreground)' }}>Send feedback to agent</h2>
            <p id="fw-agent-description" style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--fw-foreground-muted)' }}>Choose the work. CRRT creates one exact, private handoff without leaving this page.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Agent Bridge" style={iconButtonStyle}><X size={17} aria-hidden="true" /></button>
        </header>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>{message || view.replace(/_/g, ' ')}</div>
          {view === 'checking' && <StateCard title="Checking access…" body="Confirming your project role and plan." busy />}
          {view === 'authentication_required' && <StateCard title="Log in to continue" body="Sign in in the CRRT popup. This page will stay exactly where it is." actionLabel={loginBusy ? 'Opening sign in…' : 'Log in to CRRT'} action={() => { void onLogin() }} disabled={loginBusy} error={loginError || message} />}
          {view === 'upgrade_required' && <StateCard title="Agent is a premium feature" body="Upgrade this project’s owner plan, then return here. Your selection will stay ready." actionLabel={busy ? 'Opening billing…' : 'Upgrade plan'} action={() => { void beginUpgrade() }} disabled={busy} error={message} link={upgradeUrl} />}
          {view === 'owner_upgrade_required' && <StateCard title="Ask the owner to upgrade" body="This project’s owner needs an eligible CRRT plan before collaborators can use Agent." error={message} />}
          {view === 'seat_limit_reached' && <StateCard title="No Agent seats available" body="The owner’s five collaborator seats are in use. Ask the owner to free a seat." error={message} />}
          {(view === 'forbidden' || view === 'project_access_denied') && <StateCard title="Agent is unavailable" body="Your current project role does not allow Agent access." error={message} />}
          {view === 'error' && <StateCard title="Agent could not load" body="Your selection is still here. Retry when you’re ready." actionLabel="Retry" action={() => { void refreshAccess(true) }} error={message} />}

          {view === 'ready' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <strong style={{ color: 'var(--fw-foreground)', fontSize: 13 }}>{selectedIds.size} of {comments.filter(canSelect).length} selected</strong>
              <button type="button" onClick={() => setSelectedIds(new Set(comments.filter(canSelect).map((comment) => comment.id)))} style={textButtonStyle}>Select all</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} style={textButtonStyle}>Clear</button>
            </div>
            {comments.length === 0 ? <StateCard title="No actionable feedback" body="Open or accepted comments from this page will appear here." /> : (
              <div role="group" aria-label="Feedback to send" style={{ display: 'grid', gap: 8 }}>
                {comments.map((comment) => {
                  const selectable = canSelect(comment)
                  return <div key={comment.id} style={{ border: '1px solid var(--fw-contrast-08)', borderRadius: 10, padding: 12, background: 'var(--fw-contrast-03)' }}>
                    <label style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 10, alignItems: 'start', cursor: selectable ? 'pointer' : 'default' }}>
                      <input type="checkbox" checked={selectedIds.has(comment.id)} disabled={!selectable || busy} onChange={() => setSelectedIds((current) => {
                        const next = new Set(current); if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id); return next
                      })} aria-label={`Select feedback: ${comment.body}`} style={{ width: 18, height: 18, accentColor: '#E8853D' }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: 'var(--fw-foreground-soft)', fontSize: 13, lineHeight: 1.45 }}>{comment.body}</span>
                        <span style={{ display: 'block', color: 'var(--fw-foreground-faint)', fontSize: 11, marginTop: 5 }}>{comment.authorName ?? 'User'}</span>
                      </span>
                      <span style={statusStyle}>{statusLabel(comment)}</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6, margin: '9px 0 0 30px' }}>
                      {comment.reviewStatus === 'open' && <><button type="button" disabled={busy} onClick={() => { void mutate([comment.id], 'accept') }} style={smallButtonStyle}>Accept</button><button type="button" disabled={busy} onClick={() => { void mutate([comment.id], 'reject') }} style={smallButtonStyle}>Reject</button></>}
                      {comment.reviewStatus === 'accepted' && comment.implementationStatus !== 'done' && <button type="button" disabled={busy} onClick={() => { void mutate([comment.id], 'resolve') }} style={smallButtonStyle}>Resolve</button>}
                    </div>
                  </div>
                })}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <button type="button" disabled={busy || selectedIds.size === 0} onClick={() => { void confirmHandoff() }} style={primaryButtonStyle}>{busy ? 'Creating handoff…' : 'Send to agent'}</button>
              {openSelected.length > 0 && <button type="button" disabled={busy} onClick={() => { void mutate(openSelected.map((comment) => comment.id), 'accept') }} style={secondaryButtonStyle}>Accept selected</button>}
              {selected.length > 0 && <button type="button" disabled={busy} onClick={() => { void mutate(selected.map((comment) => comment.id), 'reject') }} style={secondaryButtonStyle}>Reject selected</button>}
              {resolvableSelected.length > 0 && <button type="button" disabled={busy} onClick={() => { void mutate(resolvableSelected.map((comment) => comment.id), 'resolve') }} style={secondaryButtonStyle}>Resolve selected</button>}
            </div>
            {message && <p role="alert" style={errorStyle}>{message}</p>}
          </>}

          {view === 'handoff' && share && <>
            <StateCard title="Handoff ready" body={`${selectedIds.size} feedback item${selectedIds.size === 1 ? '' : 's'} accepted and scoped to this Agent session.`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
              {TARGETS.map(({ id, label }) => <button key={id} type="button" disabled={!prompts[id]} onClick={() => { void copyPrompt(id) }} style={secondaryButtonStyle} aria-label={`Copy prompt for ${label}`}>
                {copied === id ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> {label}</>}
              </button>)}
            </div>
            <button type="button" onClick={() => { requestKey.current = null; setShare(null); setPrompts(EMPTY_PROMPTS); void refreshAccess(false) }} style={{ ...textButtonStyle, marginTop: 16 }}><RefreshCw size={13} aria-hidden="true" /> Start another handoff</button>
            {message && <p role="alert" style={errorStyle}>{message}</p>}
          </>}
        </div>
      </div>
    </div>
  )
}

function StateCard({ title, body, busy: loading, actionLabel, action, disabled, error, link }: { title: string; body: string; busy?: boolean; actionLabel?: string; action?: () => void; disabled?: boolean; error?: string; link?: string }) {
  return <div style={{ padding: 16, border: '1px solid var(--fw-contrast-08)', borderRadius: 12, background: 'var(--fw-contrast-03)' }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--fw-foreground)', fontSize: 15, fontWeight: 700 }}>{loading && <RefreshCw size={15} aria-hidden="true" />} {title}</div>
    <p style={{ margin: '7px 0 0', color: 'var(--fw-foreground-muted)', fontSize: 13, lineHeight: 1.5 }}>{body}</p>
    {actionLabel && action && <button type="button" onClick={action} disabled={disabled} style={{ ...primaryButtonStyle, marginTop: 14 }}>{actionLabel}</button>}
    {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...textButtonStyle, display: 'inline-flex', marginTop: 12 }}>Continue to billing</a>}
    {error && <p role="alert" style={errorStyle}>{error}</p>}
  </div>
}

const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 2147483646, background: 'rgba(0,0,0,.56)', backdropFilter: 'blur(10px)' }
const dialogStyle: CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2147483647, width: 'min(620px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 40px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 18, border: '1px solid rgba(232,133,61,.22)', background: 'var(--fw-surface-deep)', boxShadow: '0 28px 90px rgba(0,0,0,.62)', color: 'var(--fw-foreground)', outline: 'none' }
const iconButtonStyle: CSSProperties = { width: 34, height: 34, borderRadius: 9999, border: '1px solid var(--fw-contrast-08)', background: 'var(--fw-contrast-03)', color: 'var(--fw-foreground-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }
const primaryButtonStyle: CSSProperties = { minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', border: 0, borderRadius: 9999, background: '#E8853D', color: '#080808', fontWeight: 750, cursor: 'pointer', fontFamily: 'inherit' }
const secondaryButtonStyle: CSSProperties = { minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 11px', border: '1px solid var(--fw-contrast-10)', borderRadius: 8, background: 'var(--fw-contrast-04)', color: 'var(--fw-foreground-soft)', fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' }
const smallButtonStyle: CSSProperties = { minHeight: 28, padding: '4px 9px', border: '1px solid var(--fw-contrast-09)', borderRadius: 7, background: 'transparent', color: 'var(--fw-foreground-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }
const textButtonStyle: CSSProperties = { minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 6px', border: 0, background: 'transparent', color: 'var(--fw-active-label)', fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }
const statusStyle: CSSProperties = { padding: '3px 7px', borderRadius: 9999, background: 'var(--fw-contrast-06)', color: 'var(--fw-foreground-muted)', fontSize: 10, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }
const errorStyle: CSSProperties = { margin: '12px 0 0', color: 'var(--fw-danger-label)', fontSize: 12, lineHeight: 1.4 }
const visuallyHiddenStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }
