import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Bot, Check, ChevronDown, Copy, ExternalLink, RefreshCw, X } from 'lucide-react'
import '@fontsource-variable/figtree/wght.css'
import type { WidgetLoginSession } from '../lib/widgetLogin'
import { WidgetRequestError } from '../lib/widgetLogin'
import {
  createWidgetAgentSession,
  createWidgetExternalWork,
  fetchWidgetExternalWorkDraft,
  fetchWidgetAgentEligibility,
  startWidgetAgentUpgrade,
  type WidgetAgentAccessState,
  type WidgetAgentComment,
  type ExternalWorkProvider,
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
const PROVIDERS: Array<{ id: ExternalWorkProvider; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'github', label: 'GitHub' },
  { id: 'jira', label: 'Jira' },
]
const PROVIDER_LABELS: Record<ExternalWorkProvider, string> = { linear: 'Linear', github: 'GitHub', jira: 'Jira' }

type ExternalWorkState = { state: 'creating' | 'created' | 'failed'; url?: string; message?: string }

function createIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `widget_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function isDefaultSelection(comment: WidgetAgentComment) {
  return canSelect(comment) && comment.implementationStatus !== 'in_progress'
}

function canSelect(comment: WidgetAgentComment) {
  return comment.reviewStatus === 'accepted' && comment.implementationStatus !== 'ready_for_testing' && comment.implementationStatus !== 'done'
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

export interface PremiumAgentBridgeServices {
  fetchEligibility: typeof fetchWidgetAgentEligibility
  createSession: typeof createWidgetAgentSession
  startUpgrade: typeof startWidgetAgentUpgrade
  fetchExternalDraft: typeof fetchWidgetExternalWorkDraft
  createExternal: typeof createWidgetExternalWork
  loadPrompts: typeof loadPrompts
}

export const premiumAgentBridgeServices: PremiumAgentBridgeServices = {
  fetchEligibility: fetchWidgetAgentEligibility,
  createSession: createWidgetAgentSession,
  startUpgrade: startWidgetAgentUpgrade,
  fetchExternalDraft: fetchWidgetExternalWorkDraft,
  createExternal: createWidgetExternalWork,
  loadPrompts,
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
  services?: PremiumAgentBridgeServices
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
  services = premiumAgentBridgeServices,
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
  const [provider, setProvider] = useState<ExternalWorkProvider>('linear')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [externalWork, setExternalWork] = useState<Record<string, ExternalWorkState>>({})

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
      const result = await services.fetchEligibility(apiBase, projectId, pageUrl, widgetSession)
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
  }, [apiBase, pageUrl, projectId, services, widgetSession])

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
    try {
      const saved = window.localStorage.getItem(`crrt:external-work:${projectId}`)
      if (saved === 'github' || saved === 'linear' || saved === 'jira') setProvider(saved)
    } catch {
      // Storage is optional in privacy-restricted embeds.
    }
  }, [projectId])

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
      const created = await services.createSession(apiBase, {
        projectKey: projectId,
        pageUrl,
        commentIds: [...selectedIds],
        idempotencyKey: requestKey.current.value,
      }, widgetSession)
      const nextShare = { slug: created.slug, token: created.token }
      if (context !== contextGeneration.current) return
      const nextPrompts = await services.loadPrompts(apiBase, nextShare)
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
      const result = await services.startUpgrade(apiBase, { projectKey: projectId, pageUrl }, widgetSession)
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

  function chooseProvider(nextProvider: ExternalWorkProvider) {
    setProvider(nextProvider)
    setProviderMenuOpen(false)
    setExternalWork({})
    try { window.localStorage.setItem(`crrt:external-work:${projectId}`, nextProvider) } catch {
      // The current selection still works when storage is unavailable.
    }
  }

  async function createExternalWork() {
    const session = widgetSession!
    const context = contextGeneration.current
    const ids = [...selectedIds].filter((id) => externalWork[id]?.state !== 'created')
    if (ids.length === 0) return
    setBusy(true)
    setMessage('')
    let failures = 0
    for (const id of ids) {
      setExternalWork((current) => ({ ...current, [id]: { state: 'creating' } }))
      try {
        const prepared = await services.fetchExternalDraft(apiBase, id, provider, session)
        if (context !== contextGeneration.current) break
        const existingUrl = prepared.existing?.externalUrl ?? prepared.existing?.issueUrl
        if (existingUrl) {
          setExternalWork((current) => ({ ...current, [id]: { state: 'created', url: existingUrl } }))
          continue
        }
        if (!prepared.connected) throw new Error(`${PROVIDER_LABELS[prepared.provider]} is not connected to this project.`)
        const result = await services.createExternal(apiBase, id, provider, prepared.draft, session)
        /* v8 ignore next -- stale async responses are intentionally discarded */
        if (context !== contextGeneration.current) break
        setExternalWork((current) => ({ ...current, [id]: { state: 'created', url: result.externalUrl ?? result.issueUrl } }))
      } catch (error) {
        /* v8 ignore next -- stale async failures are intentionally discarded */
        if (context !== contextGeneration.current) break
        failures++
        if (error instanceof WidgetRequestError && error.status === 401) setView('authentication_required')
        setExternalWork((current) => ({
          ...current,
          [id]: { state: 'failed', message: error instanceof Error ? error.message : 'Could not create this issue.' },
        }))
      }
    }
    if (context === contextGeneration.current) {
      setBusy(false)
      setMessage(failures ? `${failures} issue${failures === 1 ? '' : 's'} could not be created. Retry the failed items.` : `${ids.length} ${PROVIDER_LABELS[provider]} issue${ids.length === 1 ? '' : 's'} ready.`)
      onFeedbackChanged?.()
    }
  }

  const approvedComments = comments.filter((comment) => comment.reviewStatus === 'accepted')
  const activeProvider = PROVIDERS.find((item) => item.id === provider)!

  return (
    <div {...{ [WIDGET_ATTR]: '' }} style={{ fontFamily: 'Figtree Variable, Figtree, Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{`
        @media (max-width: 520px) {
          [data-fw-agent-dialog="premium"] { width: calc(100vw - 16px) !important; max-height: calc(100vh - 16px) !important; }
          [data-fw-agent-header] { padding: 18px !important; }
          [data-fw-agent-content] { padding: 14px 18px 16px !important; }
          [data-fw-agent-footer] { grid-template-columns: 1fr !important; padding: 13px 18px 15px !important; }
        }
        [data-fw-agent-primary]:disabled {
          border: 1px solid var(--fw-contrast-08) !important;
          background: var(--fw-contrast-04) !important;
          color: var(--fw-foreground-faint) !important;
          cursor: not-allowed !important;
          box-shadow: none !important;
        }
        [data-fw-agent-action] {
          transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease;
        }
        [data-fw-agent-primary]:not(:disabled):hover {
          border-color: rgba(255,255,255,.92) !important;
          background: rgba(255,255,255,.92) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,.16) !important;
        }
        [data-fw-agent-tracker]:not(:disabled):hover {
          border-color: rgba(155, 143, 238, .38) !important;
          background: rgba(121, 105, 211, .16) !important;
        }
        [data-fw-agent-action]:focus-visible {
          outline: 2px solid rgba(174, 164, 255, .82);
          outline-offset: 2px;
        }
        [data-fw-agent-tracker]:disabled {
          border-color: var(--fw-contrast-08) !important;
          background: var(--fw-contrast-03) !important;
          color: var(--fw-foreground-faint) !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
        }
      `}</style>
      <div aria-hidden="true" style={overlayStyle} />
      <div ref={dialogRef} data-fw-agent-dialog="premium" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fw-agent-title" aria-describedby="fw-agent-description" style={dialogStyle}>
        <header data-fw-agent-header style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '22px 24px 19px', borderBottom: '1px solid var(--fw-contrast-07)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(232,133,61,.25)', background: 'rgba(232,133,61,.12)', color: '#E8853D', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Bot size={18} strokeWidth={1.8} aria-hidden="true" /></div>
          <div style={{ flex: 1 }}>
            <h2 id="fw-agent-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.15, letterSpacing: '-.025em', fontWeight: 620, color: 'var(--fw-foreground)' }}>Turn feedback into work</h2>
            <p id="fw-agent-description" style={{ margin: '6px 0 0', maxWidth: 440, fontSize: 13, lineHeight: 1.45, color: 'var(--fw-foreground-muted)' }}>Select comments, then copy one agent-ready prompt or create tracked issues.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Agent Bridge" style={iconButtonStyle}><X size={17} aria-hidden="true" /></button>
        </header>

        <div data-fw-agent-content style={{ padding: '17px 24px 20px', overflowY: 'auto' }}>
          <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>{message || view.replace(/_/g, ' ')}</div>
          {view === 'checking' && <StateCard title="Checking access…" body="Confirming your project role and plan." busy />}
          {view === 'authentication_required' && <StateCard title="Log in to continue" body="Sign in in the CRRT popup. This page will stay exactly where it is." actionLabel={loginBusy ? 'Opening sign in…' : 'Log in to CRRT'} action={() => { void onLogin() }} disabled={loginBusy} error={loginError || message} />}
          {view === 'upgrade_required' && <StateCard title="Agent is a premium feature" body="Upgrade this project’s owner plan, then return here. Your selection will stay ready." actionLabel={busy ? 'Opening billing…' : 'Upgrade plan'} action={() => { void beginUpgrade() }} disabled={busy} error={message} link={upgradeUrl} />}
          {view === 'owner_upgrade_required' && <StateCard title="Ask the owner to upgrade" body="This project’s owner needs an eligible CRRT plan before collaborators can use Agent." error={message} />}
          {view === 'seat_limit_reached' && <StateCard title="No Agent seats available" body="The owner’s five collaborator seats are in use. Ask the owner to free a seat." error={message} />}
          {(view === 'forbidden' || view === 'project_access_denied') && <StateCard title="Agent is unavailable" body="Your current project role does not allow Agent access." error={message} />}
          {view === 'error' && <StateCard title="Agent could not load" body="Your selection is still here. Retry when you’re ready." actionLabel="Retry" action={() => { void refreshAccess(true) }} error={message} />}

          {view === 'ready' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: 'var(--fw-foreground-muted)', fontSize: 12 }}>{selectedIds.size} of {approvedComments.filter(canSelect).length} selected</span>
              <span aria-hidden="true" style={{ color: 'var(--fw-foreground-faint)' }}>·</span>
              <button type="button" onClick={() => setSelectedIds(new Set(approvedComments.filter(canSelect).map((comment) => comment.id)))} style={textButtonStyle}>Select all</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} style={textButtonStyle}>Clear</button>
            </div>
            {approvedComments.length === 0 ? <StateCard title="No approved feedback" body="Approved comments from this page will appear here." /> : (
              <div role="group" aria-label="Feedback to send" style={{ borderTop: '1px solid var(--fw-contrast-08)' }}>
                {approvedComments.map((comment) => {
                  const selectable = canSelect(comment)
                  const workState = externalWork[comment.id]
                  return <div key={comment.id} style={{ padding: '15px 0 14px', borderBottom: '1px solid var(--fw-contrast-08)' }}>
                    <label style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', gap: 11, alignItems: 'start', cursor: selectable ? 'pointer' : 'default' }}>
                      <input type="checkbox" checked={selectedIds.has(comment.id)} disabled={!selectable || busy} onChange={() => setSelectedIds((current) => {
                        const next = new Set(current); if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id); return next
                      })} aria-label={`Select feedback: ${comment.body}`} style={{ width: 17, height: 17, marginTop: 1, accentColor: '#E8853D' }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: 'var(--fw-foreground-soft)', fontSize: 14, lineHeight: 1.4, fontWeight: 520, letterSpacing: '-.005em' }}>{comment.body}</span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', color: 'var(--fw-foreground-faint)', fontSize: 11, lineHeight: 1.35, marginTop: 5 }}>
                          <span>{comment.authorName ?? 'User'}</span>
                          {comment.selector && <><span aria-hidden="true">·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{comment.selector}</span></>}
                        </span>
                      </span>
                      <span style={{ display: 'grid', justifyItems: 'end', gap: 7 }}>
                        <span style={statusStyle}>{statusLabel(comment)}</span>
                        {workState?.state === 'creating' && <span style={externalStatusStyle}><ProviderMark provider={provider} size={13} /> Creating</span>}
                        {workState?.state === 'created' && <a href={workState.url} target="_blank" rel="noreferrer" style={externalSuccessStyle}><ProviderMark provider={provider} size={13} /> Created <ExternalLink size={10} aria-hidden="true" /></a>}
                        {workState?.state === 'failed' && <span title={workState.message} style={externalFailureStyle}><ProviderMark provider={provider} size={13} /> Failed</span>}
                      </span>
                    </label>
                  </div>
                })}
              </div>
            )}
            {message && <p role="alert" style={errorStyle}>{message}</p>}
          </>}

          {view === 'handoff' && share && <>
            <StateCard title="Handoff ready" body={`${selectedIds.size} feedback item${selectedIds.size === 1 ? '' : 's'} accepted and scoped to this Agent session.`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
              {TARGETS.map(({ id, label }) => <button key={id} type="button" disabled={!prompts[id]} onClick={() => { void copyPrompt(id) }} style={copied === id ? copiedButtonStyle : secondaryButtonStyle} aria-label={`Copy prompt for ${label}`}>
                {copied === id ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> {label}</>}
              </button>)}
            </div>
            <button type="button" onClick={() => { requestKey.current = null; setShare(null); setPrompts(EMPTY_PROMPTS); void refreshAccess(false) }} style={{ ...textButtonStyle, marginTop: 16 }}><RefreshCw size={13} aria-hidden="true" /> Start another handoff</button>
            {message && <p role="alert" style={errorStyle}>{message}</p>}
          </>}
        </div>
        {view === 'ready' && <footer data-fw-agent-footer style={stickyFooterStyle}>
          <button data-fw-agent-primary data-fw-agent-action type="button" disabled={busy || selectedIds.size === 0} onClick={() => { void confirmHandoff() }} style={footerPrimaryStyle}>
            <Copy size={15} strokeWidth={1.8} aria-hidden="true" /> {busy ? 'Working…' : 'Copy for agent'}<span style={visuallyHiddenStyle}>Send to agent</span>
          </button>
          <div style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
            {providerMenuOpen && <div role="menu" aria-label="Choose issue tracker" style={providerMenuStyle}>
              {PROVIDERS.map((item) => <button key={item.id} type="button" role="menuitemradio" aria-checked={provider === item.id} onClick={() => chooseProvider(item.id)} style={providerMenuItemStyle}>
                <ProviderMark provider={item.id} size={18} /> <span>{item.label}</span>{provider === item.id && <Check size={14} aria-hidden="true" />}
              </button>)}
            </div>}
            <button data-fw-agent-tracker data-fw-agent-action type="button" disabled={busy || selectedIds.size === 0} onClick={() => { void createExternalWork() }} aria-label={`Create ${selectedIds.size} ${PROVIDERS.find((item) => item.id === provider)?.label} issue${selectedIds.size === 1 ? '' : 's'}`} style={providerActionStyle}>
              <ProviderMark provider={provider} size={17} />
              <span>Create {selectedIds.size} in {activeProvider.label}</span>
            </button>
            <button data-fw-agent-tracker data-fw-agent-action type="button" disabled={busy} aria-haspopup="menu" aria-expanded={providerMenuOpen} aria-label="Choose issue tracker" onClick={() => setProviderMenuOpen((open) => !open)} style={providerChevronStyle}><ChevronDown size={16} aria-hidden="true" /></button>
          </div>
        </footer>}
      </div>
    </div>
  )
}

export function ProviderMark({ provider, size }: { provider: ExternalWorkProvider; size: number }) {
  if (provider === 'github') return <svg data-provider-logo="github" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1.1.1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.4-5.5-6A4.7 4.7 0 0 1 6.4 8c-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.4 1.3a11.8 11.8 0 0 1 6.2 0c2.4-1.6 3.4-1.3 3.4-1.3.7 1.7.3 3 .1 3.3a4.7 4.7 0 0 1 1.3 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2V22c0 .4.2.7.8.6A11.2 11.2 0 0 0 12 .8Z" /></svg>
  if (provider === 'linear') return <svg data-provider-logo="linear" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="#8B8BF8" strokeWidth="2.15" strokeLinecap="round">
    <path d="M8.15 4.05A8.25 8.25 0 1 1 4 8.2" />
    <path d="m3.35 12.15 8.5 8.5M3.9 8.65l11.45 11.45M5.5 5.95l12.55 12.55" />
  </svg>
  return <svg data-provider-logo="jira" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path fill="#2684FF" d="M12 1.5 22.5 12 12 22.5 1.5 12 12 1.5Z" />
    <path fill="#fff" fillOpacity=".95" d="M12 6.2 17.8 12 12 17.8 6.2 12 12 6.2Z" />
    <path fill="#2684FF" d="m12 9.15 2.85 2.85L12 14.85 9.15 12 12 9.15Z" />
  </svg>
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

const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 2147483646, background: 'rgba(0,0,0,.52)', backdropFilter: 'blur(8px)' }
const dialogStyle: CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2147483647, width: 'min(560px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 32px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 16, border: '1px solid var(--fw-contrast-10)', background: 'var(--fw-surface-deep)', boxShadow: '0 32px 100px rgba(0,0,0,.68)', color: 'var(--fw-foreground)', outline: 'none' }
const iconButtonStyle: CSSProperties = { width: 32, height: 32, borderRadius: 9999, border: '1px solid var(--fw-contrast-08)', background: 'transparent', color: 'var(--fw-foreground-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }
const primaryButtonStyle: CSSProperties = { minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', border: 0, borderRadius: 10, background: '#E8853D', color: '#080808', fontWeight: 620, cursor: 'pointer', fontFamily: 'inherit' }
const secondaryButtonStyle: CSSProperties = { minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 11px', border: '1px solid var(--fw-contrast-10)', borderRadius: 9, background: 'var(--fw-contrast-03)', color: 'var(--fw-foreground-soft)', fontWeight: 580, cursor: 'pointer', fontFamily: 'inherit' }
const copiedButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: 'rgba(166, 154, 255, .5)', background: 'rgba(128, 111, 230, .2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)', color: '#F4F1FF' }
const textButtonStyle: CSSProperties = { minHeight: 26, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 5px', border: 0, background: 'transparent', color: 'var(--fw-active-label-soft)', fontSize: 11, fontWeight: 560, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }
const statusStyle: CSSProperties = { padding: '3px 7px', borderRadius: 9999, background: 'var(--fw-contrast-05)', color: 'var(--fw-foreground-muted)', fontSize: 9.5, lineHeight: 1.3, fontWeight: 620, textTransform: 'capitalize', whiteSpace: 'nowrap' }
const errorStyle: CSSProperties = { margin: '12px 0 0', color: 'var(--fw-danger-label)', fontSize: 12, lineHeight: 1.4 }
const visuallyHiddenStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }
const stickyFooterStyle: CSSProperties = { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(190px, 1.16fr) minmax(190px, .84fr)', gap: 9, padding: '15px 24px 17px', borderTop: '1px solid var(--fw-contrast-08)', background: 'var(--fw-surface-deep)', boxShadow: '0 -10px 26px rgba(0,0,0,.14)' }
const footerPrimaryStyle: CSSProperties = { ...primaryButtonStyle, minHeight: 44, border: '1px solid var(--fw-foreground)', borderRadius: 10, background: 'var(--fw-foreground)', boxShadow: '0 8px 24px rgba(0,0,0,.12)', color: 'var(--fw-surface-deep)', fontSize: 13 }
const providerActionStyle: CSSProperties = { minHeight: 44, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 10px', border: '1px solid rgba(155, 143, 238, .24)', borderRight: 0, borderRadius: '10px 0 0 10px', background: 'rgba(121, 105, 211, .1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.045)', color: 'var(--fw-foreground)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const providerChevronStyle: CSSProperties = { width: 38, minHeight: 44, display: 'grid', placeItems: 'center', border: '1px solid rgba(155, 143, 238, .24)', borderRadius: '0 10px 10px 0', background: 'rgba(121, 105, 211, .1)', color: 'var(--fw-foreground-muted)', cursor: 'pointer' }
const providerMenuStyle: CSSProperties = { position: 'absolute', right: 0, bottom: 52, zIndex: 2, width: 190, padding: 6, border: '1px solid var(--fw-contrast-12)', borderRadius: 11, background: 'var(--fw-surface-solid)', boxShadow: '0 18px 48px rgba(0,0,0,.5)' }
const providerMenuItemStyle: CSSProperties = { width: '100%', minHeight: 40, display: 'grid', gridTemplateColumns: '22px 1fr 18px', alignItems: 'center', gap: 9, padding: '7px 9px', border: 0, borderRadius: 7, background: 'transparent', color: 'var(--fw-foreground-soft)', textAlign: 'left', fontFamily: 'inherit', fontSize: 13, fontWeight: 540, cursor: 'pointer' }
const externalStatusStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fw-foreground-muted)', fontSize: 10 }
const externalSuccessStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fw-success-label)', fontSize: 10, textDecoration: 'none' }
const externalFailureStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fw-danger-label)', fontSize: 10, fontWeight: 620 }
