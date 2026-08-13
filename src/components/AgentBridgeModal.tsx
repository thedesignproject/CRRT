import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

function pagePath(url: string): string {
  try { return new URL(url).pathname || '/' } catch { return url }
}

type Target = 'claude-code' | 'codex' | 'generic'

interface PromptResponse {
  slug: string
  target: string
  prompt: string
  docUrl: string
}

interface StateResponse {
  share: { slug: string; scopeType: 'page' | 'selection' | 'project'; revision: number }
  project: { publicKey: string; name: string; repoUrl: string | null }
  comments: Array<{
    id: string
    pageUrl: string
    selector: string
    body: string
    reviewStatus: 'open' | 'accepted' | 'rejected'
    implementationStatus: 'unassigned' | 'claimed' | 'in_progress' | 'blocked' | 'done'
    claimedByAgentId: string | null
    createdAt: string
    authorName?: string | null
  }>
  presence: Array<{
    agentId: string
    status: string
    summary: string | null
    lastSeenAt: string
  }>
}

interface ProjectResponse {
  projectKey: string
  projectName: string
  doc: { slug: string; token: string; docUrl: string; promptUrl: string }
}

interface Session {
  slug: string
  token: string
}

const TARGETS: Array<{ id: Target; label: string; hint: string }> = [
  { id: 'claude-code', label: 'Claude Code', hint: 'Anthropic Claude Code CLI' },
  { id: 'codex', label: 'Codex', hint: 'OpenAI Codex CLI' },
  { id: 'generic', label: 'Generic', hint: 'Any agent with a prompt box' },
]

const WIDGET_ATTR = 'data-fw'
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

// Embedded widgets render above customer-page chrome, so we use the
// max-int z-index pattern shared with FeedbackWidget.tsx.
const Z_OVERLAY = 2147483646
const Z_MODAL = 2147483647
const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'

// ─── Fetch helpers (module scope so useEffect bodies stay free of `fetch`) ──

async function fetchProjectSession(apiBase: string, projectId: string): Promise<Session> {
  const res = await fetch(`${apiBase}/v1/public/project?projectKey=${encodeURIComponent(projectId)}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Could not start a session (${res.status}) ${detail}`.trim())
  }
  const body = (await res.json()) as ProjectResponse
  return { slug: body.doc.slug, token: body.doc.token }
}

async function fetchPrompt(apiBase: string, session: Session, target: Target): Promise<readonly [Target, string]> {
  const url = `${apiBase}/v1/shares/${session.slug}/prompt?token=${encodeURIComponent(session.token)}&target=${target}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Prompt fetch failed (${res.status})`)
  const body = (await res.json()) as PromptResponse
  return [target, body.prompt] as const
}

async function fetchAllPrompts(apiBase: string, session: Session): Promise<Record<Target, string>> {
  const entries = await Promise.all(TARGETS.map(({ id }) => fetchPrompt(apiBase, session, id)))
  return Object.fromEntries(entries) as Record<Target, string>
}

async function fetchShareState(apiBase: string, session: Session): Promise<StateResponse | null> {
  const res = await fetch(`${apiBase}/v1/agent/shares/${session.slug}/state?token=${encodeURIComponent(session.token)}`)
  if (!res.ok) return null
  return (await res.json()) as StateResponse
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function readShareFromUrl(): Session | null {
  const search = new URLSearchParams(window.location.search)
  const slug = search.get('fw_share') ?? ''
  const token = search.get('token') ?? ''
  return slug && token ? { slug, token } : null
}

// ─── State ──────────────────────────────────────────────────────────────────

interface State {
  session: Session | null
  prompts: Record<Target, string>
  shareState: StateResponse | null
  copied: Target | null
  selected: Target | null
  error: string | null
  tick: number
}

type Action =
  | { type: 'session-resolved'; session: Session }
  | { type: 'prompts-loaded'; prompts: Record<Target, string> }
  | { type: 'state-loaded'; shareState: StateResponse }
  | { type: 'copied'; target: Target | null }
  | { type: 'error'; message: string }
  | { type: 'tick' }

const EMPTY_PROMPTS: Record<Target, string> = { 'claude-code': '', 'codex': '', 'generic': '' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'session-resolved':
      return { ...state, session: action.session }
    case 'prompts-loaded':
      return { ...state, prompts: action.prompts }
    case 'state-loaded':
      return { ...state, shareState: action.shareState }
    case 'copied':
      return { ...state, copied: action.target, selected: action.target ?? state.selected }
    case 'error':
      return { ...state, error: action.message }
    case 'tick':
      return { ...state, tick: state.tick + 1 }
  }
}

function initState(initialSession: Session | null): State {
  return {
    session: initialSession,
    prompts: EMPTY_PROMPTS,
    shareState: null,
    copied: null,
    selected: null,
    error: null,
    tick: 0,
  }
}

// ─── Styles (module-scope so JSX stays readable + references are stable) ────

const containerStyle: CSSProperties = { fontFamily: FONT, color: 'var(--fw-foreground)' }

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: Z_OVERLAY,
  background: 'rgba(0, 0, 0, 0.56)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  pointerEvents: 'none',
  animation: 'fw-agent-fade 0.15s ease both',
}

const modalStyle: CSSProperties = {
  position: 'fixed',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: Z_MODAL,
  width: 'min(600px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 48px)',
  display: 'flex', flexDirection: 'column',
  background: 'var(--fw-surface-deep)',
  border: '1px solid rgba(232, 133, 61, 0.20)',
  borderRadius: 18,
  boxShadow: '0 28px 90px rgba(0, 0, 0, 0.62), inset 0 1px 0 var(--fw-contrast-04)',
  animation: `fw-agent-pop 0.18s ${EASE_OUT_EXPO} both`,
  overflow: 'hidden',
}

const closeButtonStyle: CSSProperties = {
  marginLeft: 'auto', width: 34, height: 34, borderRadius: 9999,
  border: '1px solid var(--fw-contrast-08)', background: 'var(--fw-contrast-03)', cursor: 'pointer',
  color: 'var(--fw-foreground-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

const targetButtonBase: CSSProperties = {
  textAlign: 'left',
  padding: '14px 14px',
  borderRadius: 12,
  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  fontFamily: FONT,
}

const presenceCardStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'var(--fw-contrast-04)',
  border: '1px solid var(--fw-contrast-07)',
  borderRadius: 8,
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const statusPillBaseStyle: CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
  fontSize: 12, fontWeight: 600,
  whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1,
}

// ─── Component ──────────────────────────────────────────────────────────────

interface AgentBridgeModalProps {
  apiBase: string
  projectId: string
  onClose: () => void
  onBeforeCopy?: () => Promise<boolean>
}

export function AgentBridgeModal({ apiBase, projectId, onClose, onBeforeCopy }: AgentBridgeModalProps) {
  const initialSession = useMemo(readShareFromUrl, [])
  const [state, dispatch] = useReducer(reducer, initialSession, initState)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const { session, prompts, shareState, copied, selected, error } = state

  // Tick every 10s to keep "N seconds ago" labels fresh.
  useEffect(() => {
    const interval = window.setInterval(() => dispatch({ type: 'tick' }), 10000)
    return () => window.clearInterval(interval)
  }, [])

  // Escape to close, plus pointerdown outside the modal to dismiss.
  // (Pointerdown outside avoids putting a click handler on the visual backdrop,
  // which would otherwise need to be a button and would steal Tab focus.)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointerDown(event: PointerEvent) {
      const node = modalRef.current
      if (node && !node.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  // Resolve a session: use URL params if present, otherwise auto-provision one.
  useEffect(() => {
    if (session) return
    let cancelled = false
    fetchProjectSession(apiBase, projectId)
      .then((next) => {
        if (!cancelled) dispatch({ type: 'session-resolved', session: next })
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Could not start a session.' })
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, projectId, session])

  // Once we have a session, load prompts once.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchAllPrompts(apiBase, session)
      .then((next) => {
        if (!cancelled) dispatch({ type: 'prompts-loaded', prompts: next })
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Could not load session.' })
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, session])

  // Poll /state while the modal is open so presence + accepted comments stay live.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const refresh = () => {
      fetchShareState(apiBase, session)
        .then((next) => {
          if (next && !cancelled) dispatch({ type: 'state-loaded', shareState: next })
        })
        .catch(() => {
          // swallow transient network blips — next tick will retry
        })
    }
    refresh()
    const interval = window.setInterval(refresh, 4000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiBase, session])

  const acceptedComments = shareState?.comments.filter((c) => c.reviewStatus === 'accepted') ?? []

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const seenIdsRef = useRef<Set<string>>(new Set())
  const acceptedIds = acceptedComments.map((c) => c.id).join(',')
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set<string>()
      for (const c of acceptedComments) {
        // Previously seen → preserve user's explicit choice. New → default selected.
        if (seenIdsRef.current.has(c.id)) {
          if (prev.has(c.id)) next.add(c.id)
        } else {
          next.add(c.id)
        }
      }
      return next
    })
    seenIdsRef.current = new Set(acceptedComments.map((c) => c.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedIds])
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const buildPrompt = useCallback((target: Target) => {
    const original = prompts[target]
    if (!original) return ''
    const selected = acceptedComments.filter((c) => selectedIds.has(c.id))
    if (selected.length === 0 || selected.length === acceptedComments.length) return original
    const list = selected.map((c, i) => `${i + 1}. "${c.body}" — ${pagePath(c.pageUrl)}`).join('\n')
    return `ACT ONLY ON THESE FEEDBACK ITEMS (the rest of the prompt may list more — ignore those):\n${list}\n\n---\n\n${original}`
  }, [prompts, acceptedComments, selectedIds])

  const handleCopy = useCallback(async (target: Target) => {
    const text = buildPrompt(target)
    if (!text) return
    if (onBeforeCopy) {
      const canCopy = await onBeforeCopy()
      if (!canCopy) return
    }
    try {
      await navigator.clipboard.writeText(text)
      dispatch({ type: 'copied', target })
      window.setTimeout(() => dispatch({ type: 'copied', target: null }), 1600)
    } catch {
      dispatch({ type: 'error', message: 'Copy failed — select the prompt manually and copy.' })
    }
  }, [buildPrompt, onBeforeCopy])
  const openCount = shareState?.comments.filter((c) => c.reviewStatus === 'open').length ?? 0
  const promptsReady = TARGETS.every(({ id }) => Boolean(prompts[id]))

  return (
    <div {...{ [WIDGET_ATTR]: '' }} style={containerStyle}>
      <div aria-hidden="true" style={overlayStyle} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connect agent"
        style={modalStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--fw-contrast-06)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: 0, color: 'var(--fw-foreground)' }}>
              {shareState?.project.name ?? 'Connect an agent'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fw-foreground-muted)', marginTop: 5, lineHeight: 1.4, maxWidth: 440 }}>
              Paste one of these prompts into your agent — it joins this session and starts on the feedback ready below.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--fw-contrast-06)'; e.currentTarget.style.color = 'var(--fw-foreground)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--fw-contrast-03)'; e.currentTarget.style.color = 'var(--fw-foreground-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {TARGETS.map(({ id, label, hint }) => (
              <TargetButton
                key={id}
                target={id}
                label={label}
                hint={hint}
                ready={Boolean(prompts[id]) && (acceptedComments.length === 0 || selectedIds.size > 0)}
                copied={copied === id}
                selected={selected === id}
                onCopy={handleCopy}
              />
            ))}
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.24)', color: 'var(--fw-danger-label)', fontSize: 12 }}>
              {error}
            </div>
          )}

          {!error && !promptsReady && (
            <div style={{ fontSize: 12, color: 'var(--fw-foreground-muted)', marginBottom: 16 }}>
              Starting a session…
            </div>
          )}

          {shareState && shareState.presence.length > 0 && (
            <Section label="Live agents">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {shareState.presence.map((p) => (
                  <div key={p.agentId} style={presenceCardStyle}>
                    <span style={{ fontWeight: 700, color: 'var(--fw-foreground)' }}>{p.agentId}</span>
                    <span style={{ color: 'var(--fw-foreground-muted)' }}>{p.status}</span>
                    {p.summary && <span style={{ color: 'var(--fw-foreground-faint)' }}>· {p.summary}</span>}
                    <span style={{ color: 'var(--fw-foreground-faint)', marginLeft: 'auto', fontSize: 12 }}>{timeAgo(p.lastSeenAt)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {shareState && (
            <Section label={selectedIds.size === acceptedComments.length
              ? `Ready for agent (${acceptedComments.length})`
              : `Ready for agent (${selectedIds.size}/${acceptedComments.length} selected)`}>
              {acceptedComments.length === 0 ? (
                <div style={{ background: 'var(--fw-contrast-03)', border: '1px dashed var(--fw-contrast-10)', borderRadius: 10, padding: 16, textAlign: 'center', color: 'var(--fw-foreground-muted)', fontSize: 13 }}>
                  No accepted comments yet. They'll show up here the moment a reviewer accepts one.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {acceptedComments.map((comment) => {
                    const author = comment.authorName ?? null
                    const isSelected = selectedIds.has(comment.id)
                    return (
                      <button
                        type="button"
                        key={comment.id}
                        onClick={() => toggleSelected(comment.id)}
                        style={{
                          display: 'block', textAlign: 'left', width: '100%',
                          background: isSelected ? 'rgba(232, 133, 61, 0.08)' : 'var(--fw-contrast-03)',
                          border: `1px solid ${isSelected ? 'rgba(232, 133, 61, 0.28)' : 'var(--fw-contrast-07)'}`,
                          borderRadius: 10, padding: 12, cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: isSelected ? 1 : 0.55,
                          transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${isSelected ? '#E8853D' : 'var(--fw-contrast-18)'}`,
                            background: isSelected ? '#E8853D' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#080808', marginTop: 1,
                            transition: 'all 0.15s',
                          }}>
                            {isSelected && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--fw-foreground-soft)', lineHeight: 1.5, marginBottom: 6 }}>{comment.body}</div>
                            <div style={{ fontSize: 12, color: 'var(--fw-foreground-faint)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {author && <span style={{ fontWeight: 600, color: 'var(--fw-foreground-muted)' }}>{author}</span>}
                              {author && <span aria-hidden="true">·</span>}
                              <span>{timeAgo(comment.createdAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span style={{ fontFamily: MONO }}>{pagePath(comment.pageUrl)}</span>
                            </div>
                          </div>
                          {comment.implementationStatus !== 'unassigned' && (
                            <StatusPill status={comment.implementationStatus} />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {shareState && openCount > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fw-foreground-faint)' }}>
              {openCount} more comment{openCount === 1 ? '' : 's'} waiting on review.
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fw-agent-fade { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes fw-agent-pop {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  )
}

interface TargetButtonProps {
  target: Target
  label: string
  hint: string
  ready: boolean
  copied: boolean
  selected: boolean
  onCopy: (target: Target) => void
}

function TargetButton({ target, label, hint, ready, copied, selected, onCopy }: TargetButtonProps) {
  const [hovered, setHovered] = useState(false)
  const isCopied = copied
  const isSelected = selected && !copied
  const style: CSSProperties = {
    ...targetButtonBase,
    position: 'relative',
    background: isCopied
      ? 'rgba(232, 133, 61, 0.18)'
      : isSelected
        ? 'rgba(232, 133, 61, 0.10)'
        : hovered && ready
          ? 'var(--fw-contrast-055)'
          : 'var(--fw-contrast-03)',
    color: 'var(--fw-foreground)',
    border: `1px solid ${isCopied || isSelected ? 'rgba(232, 133, 61, 0.42)' : hovered && ready ? 'var(--fw-contrast-14)' : 'var(--fw-contrast-08)'}`,
    cursor: ready ? 'pointer' : 'default',
    opacity: ready ? 1 : 0.55,
    transition: 'background 0.15s, border-color 0.15s',
  }
  return (
    <button
      type="button"
      onClick={() => onCopy(target)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={!ready}
      style={style}
    >
      {isSelected && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 16, height: 16, borderRadius: '50%',
          background: '#E8853D', color: '#080808',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>
          ✓
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 4, color: isCopied ? 'var(--fw-active-label)' : 'var(--fw-foreground)' }}>
        {isCopied ? 'Copied ✓' : ready ? `Copy ${label}` : label}
      </div>
      <div style={{ fontSize: 12, color: isCopied ? 'var(--fw-active-label-soft)' : 'var(--fw-foreground-muted)', lineHeight: 1.3 }}>
        {ready ? hint : 'Loading…'}
      </div>
    </button>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fw-foreground-meta)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  unassigned: { bg: 'var(--fw-contrast-06)', fg: 'var(--fw-foreground-muted)', label: 'Open' },
  claimed: { bg: 'rgba(232, 133, 61, 0.14)', fg: 'var(--fw-active-label)', label: 'Claimed' },
  in_progress: { bg: 'rgba(96, 165, 250, 0.14)', fg: 'var(--fw-info-label)', label: 'In progress' },
  blocked: { bg: 'rgba(239, 68, 68, 0.14)', fg: 'var(--fw-danger-label)', label: 'Blocked' },
  done: { bg: 'rgba(34, 197, 94, 0.14)', fg: 'var(--fw-success-label)', label: 'Done' },
}

function StatusPill({ status }: { status: string }) {
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.unassigned
  return (
    <span style={{ ...statusPillBaseStyle, background: palette.bg, color: palette.fg }}>
      {palette.label}
    </span>
  )
}
