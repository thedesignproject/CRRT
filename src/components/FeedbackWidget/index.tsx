import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSelector } from '../../lib/getSelector'
import { useScreenshotCapture } from '../../lib/screenshotCapture'
import { AgentBridgeModal } from '../AgentBridgeModal'
import type { ClickTarget, Comment, FeedbackWidgetProps, Mode, ReviewStatus } from './types'
import { AUTHOR_NAME_KEY, COMMENT_CUTOFF, PIN_GRADIENT, WIDGET_ATTR } from './constants'
import { fromPagePercent, fromPagePercentFixed, toPagePercent } from './coords'
import { avatarColor, getInitials, normalizeReviewStatus, timeAgo } from './format'
import { fetchProjectComments, patchReviewStatus as apiPatchReviewStatus, postComment } from './api'
import { FeedbackWidgetStyles } from './styles'
import { PinMarker } from './pin/PinMarker'
import { PinActionCluster } from './pin/PinActionCluster'
import { SelectingInstructionBar } from './modal/SelectingInstructionBar'
import { NameModal } from './modal/NameModal'
import { CommentSidebar } from './sidebar/CommentSidebar'
import { FloatingPill } from './pill/FloatingPill'

export function FeedbackWidget({ projectId, apiBase }: FeedbackWidgetProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [target, setTarget] = useState<ClickTarget | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [hovered, setHovered] = useState<Element | null>(null)

  const [authorName, setAuthorName] = useState<string | null>(null)
  const authorNameRef = useRef<string | null>(null)
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTHOR_NAME_KEY)
      if (stored) {
        authorNameRef.current = stored
        setAuthorName(stored)
      }
    } catch {}
  }, [])

  function saveAuthorName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    authorNameRef.current = trimmed
    setAuthorName(trimmed)
    try { localStorage.setItem(AUTHOR_NAME_KEY, trimmed) } catch {}
  }

  function openNameEditor() {
    setNameInput(authorNameRef.current ?? '')
    setShowNameModal(true)
  }

  // Draggable pill state
  const [pillPos, setPillPos] = useState({ x: window.innerWidth - 72, y: window.innerHeight - 200 })
  const dragging = useRef(false)

  // Pins/popovers use position:fixed, so their viewport coords must be recomputed
  // on scroll (and on resize / body reflow, which shift the page-percent mapping).
  // RAF-coalesced and gated by needsPositionSyncRef so idle pages stay cheap.
  const [, forceUpdate] = useState(0)
  const needsPositionSyncRef = useRef(false)
  useEffect(() => {
    let raf = 0
    const bump = () => {
      if (!needsPositionSyncRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => forceUpdate(n => n + 1))
    }

    function onResize() {
      bump()
      setPillPos(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - 48, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 160, prev.y)),
      }))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', bump, { passive: true })

    const ro = new ResizeObserver(bump)
    ro.observe(document.body)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', bump)
      ro.disconnect()
    }
  }, [])
  const dragOffset = useRef({ x: 0, y: 0 })
  const didDrag = useRef(false)
  const pillRef = useRef<HTMLDivElement>(null)

  // Pin state
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // Track current URL for SPA navigation (pins scoped to page).
  // Poll location.href because some routers (e.g. Next.js App Router) cache
  // history.pushState at module load and bypass any wrapper we install.
  const [currentUrl, setCurrentUrl] = useState(() => window.location.href.split('#')[0])
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = window.location.href.split('#')[0]
      setCurrentUrl((prev) => (prev === next ? prev : next))
    }, 300)
    return () => window.clearInterval(id)
  }, [])

  // Sidebar state
  const [comments, setComments] = useState<Comment[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badgeAnim, setBadgeAnim] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'approved'>('all')
  const [pinsVisible, setPinsVisible] = useState(true)
  const [agentsRevealed, setAgentsRevealed] = useState(false)
  const [headerPopover, setHeaderPopover] = useState<'filter' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // Synchronous guard — state updates are async, so double-firing handleSend
  // in the same tick (e.g. Cmd+Enter held down) would otherwise slip past `sending`.
  const sendingRef = useRef(false)

  const { image, previewUrl: imagePreviewUrl, capture: captureImage, clear: clearImage, toBase64: encodeImage } = useScreenshotCapture()

  // --- Fetch comments on mount ---
  useEffect(() => {
    let cancelled = false
    fetchProjectComments(apiBase, projectId).then((nextComments) => {
      if (!cancelled) setComments(nextComments)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, apiBase])

  // Close agent modal if agents get hidden while it's open
  useEffect(() => {
    if (!agentsRevealed) setAgentOpen(false)
  }, [agentsRevealed])

  // --- Set crosshair cursor when selecting ---
  useEffect(() => {
    if (mode !== 'selecting') return
    const prev = document.body.style.cursor
    document.body.style.cursor = 'crosshair'
    return () => {
      document.body.style.cursor = prev
    }
  }, [mode])

  // --- Highlight hovered element ---
  useEffect(() => {
    if (mode !== 'selecting') {
      setHovered(null)
      return
    }

    function onMove(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (el && !el.closest?.(`[${WIDGET_ATTR}]`)) {
        setHovered(el)
      } else {
        setHovered(null)
      }
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [mode])

  // --- Apply/remove highlight outline on hovered element ---
  useEffect(() => {
    if (!hovered) return
    const el = hovered as HTMLElement
    const prev = el.style.outline
    const prevOffset = el.style.outlineOffset
    el.style.outline = '2px solid rgba(59, 130, 246, 0.6)'
    el.style.outlineOffset = '2px'
    return () => {
      el.style.outline = prev
      el.style.outlineOffset = prevOffset
    }
  }, [hovered])

  // --- Handle element click in selecting mode ---
  useEffect(() => {
    if (mode !== 'selecting') return

    function onClick(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (el.closest?.(`[${WIDGET_ATTR}]`)) return

      e.preventDefault()
      e.stopPropagation()

      setSelectedPin(null)
      clearImage()
      const pct = toPagePercent(e.pageX, e.pageY)
      setTarget({
        selector: getSelector(el),
        x: pct.x,
        y: pct.y,
        url: window.location.href,
      })

      captureImage(el)

      if (!authorNameRef.current) {
        setShowNameModal(true)
        return
      }

      setMode('commenting')
    }

    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [mode])

  // --- Auto-focus textarea ---
  useEffect(() => {
    if (mode === 'commenting' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [mode])

  // --- Send comment ---
  const handleSend = useCallback(async () => {
    if (!comment.trim() || !target || sendingRef.current) return

    sendingRef.current = true
    setSending(true)

    const commentText = comment.trim()
    const targetData = { ...target }

    try {
      const payload: Record<string, unknown> = {
        projectKey: projectId,
        pageUrl: targetData.url,
        x: targetData.x,
        y: targetData.y,
        selector: targetData.selector,
        body: commentText,
      }

      if (authorNameRef.current) {
        payload.authorName = authorNameRef.current
      }

      const encoded = await encodeImage()
      if (encoded) {
        payload.imageBase64 = encoded.base64
        payload.imageMimeType = encoded.mimeType
      }

      const data = await postComment(apiBase, payload)
      if (!data) return

      const newComment: Comment = {
        id: data.id ?? crypto.randomUUID(),
        projectId,
        pageUrl: targetData.url,
        x: targetData.x,
        y: targetData.y,
        selector: targetData.selector,
        body: commentText,
        reviewStatus: 'open',
        imageUrl: data.imageUrl ?? null,
        createdAt: data.createdAt ?? new Date().toISOString(),
        authorName: data.authorName ?? authorNameRef.current ?? undefined,
      }

      setComments((prev) => [newComment, ...prev])

      setBadgeAnim(true)
      setTimeout(() => setBadgeAnim(false), 400)

      setTarget(null)
      setComment('')
      clearImage()
      setHovered(null)
      setMode('selecting')
    } catch (err) {
      console.warn('[FeedbackWidget] API error:', err)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [comment, target, projectId, apiBase, encodeImage, clearImage])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'Escape') {
        if (showNameModal) {
          setShowNameModal(false)
          setNameInput('')
        } else if (selectedPin) {
          setSelectedPin(null)
        } else if (mode === 'commenting') {
          setTarget(null)
          setComment('')
          clearImage()
          setSending(false)
          setMode('selecting')
        } else if (mode === 'selecting') {
          exitFeedbackMode()
        } else if (sidebarOpen) {
          setSidebarOpen(false)
        }
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && mode === 'commenting') {
        handleSend()
      }

      // Single-key shortcuts — skip when typing in an input
      if (isTyping) return

      // Shift+A — reveal/hide agent bridge icon (hidden pro shortcut)
      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        setAgentsRevealed((v) => !v)
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        if (mode !== 'idle') { exitFeedbackMode() } else { enterFeedbackMode() }
      }
      if (e.key === 's' || e.key === 'S') {
        enterFeedbackMode()
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'f' || e.key === 'F') {
        setSidebarOpen((v) => !v)
      }
      if (e.key === 'h' || e.key === 'H') {
        setPinsVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, handleSend, sidebarOpen, selectedPin, showNameModal])

  function exitFeedbackMode() {
    setMode('idle')
    setTarget(null)
    setComment('')
    clearImage()
    setSending(false)
    setHovered(null)
    setSelectedPin(null)
  }

  function enterFeedbackMode() {
    // Keep sidebar open — user can comment while viewing the list
    setMode('selecting')
  }

  // --- Drag handlers for pill ---
  function onPillPointerDown(e: React.PointerEvent) {
    dragging.current = true
    didDrag.current = false
    dragOffset.current = { x: e.clientX - pillPos.x, y: e.clientY - pillPos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return
      didDrag.current = true
      const x = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.y))
      setPillPos({ x, y })
    }
    function onUp() {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  function updateStatus(commentId: string, reviewStatus: ReviewStatus) {
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, reviewStatus } : c))
    apiPatchReviewStatus(apiBase, commentId, reviewStatus)
  }

  function deleteComment(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  function saveEdit(commentId: string) {
    if (!editText.trim()) return
    const text = editText.trim()
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body: text } : c))
    setEditingId(null)
  }

  // --- Highlight element from comment ---
  function highlightElement(selector: string) {
    try {
      const el = document.querySelector(selector)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('fw-highlight')
      setTimeout(() => el.classList.remove('fw-highlight'), 1400)
    } catch {
      // invalid selector — fail silently
    }
  }

  // Popover position — viewport-relative (fixed) so it doesn't extend scrollHeight.
  // Re-renders on scroll via the bump listener, keeping it anchored to the pin.
  const popoverStyle = (): React.CSSProperties => {
    if (!target) return { display: 'none' }
    const pad = 16
    const popW = 300
    const popH = 180
    const { fixedX, fixedY } = fromPagePercentFixed(target.x, target.y)
    let leftFixed = fixedX + pad
    let topFixed = fixedY + pad
    if (leftFixed + popW > window.innerWidth) leftFixed = fixedX - popW - pad
    if (topFixed + popH > window.innerHeight) topFixed = fixedY - popH - pad
    if (leftFixed < pad) leftFixed = pad
    if (topFixed < pad) topFixed = pad
    return {
      position: 'fixed',
      left: leftFixed,
      top: topFixed,
      zIndex: 2147483646,
    }
  }

  const pinPopoverStyle = (c: Comment): React.CSSProperties => {
    const pad = 16
    const popW = 280
    const { fixedX, fixedY } = fromPagePercentFixed(c.x, c.y)
    let leftFixed = fixedX + pad
    let topFixed = fixedY - 20
    if (leftFixed + popW > window.innerWidth) leftFixed = fixedX - popW - pad
    if (leftFixed < pad) leftFixed = pad
    if (topFixed < pad) topFixed = fixedY + 40
    return {
      position: 'fixed',
      left: leftFixed,
      top: topFixed,
      zIndex: 2147483646,
    }
  }

  const visibleComments = useMemo(() => comments.filter((c) => {
    if (new Date(c.createdAt) < COMMENT_CUTOFF) return false
    const commentUrl = c.pageUrl.split('#')[0]
    return commentUrl === currentUrl
  }), [comments, currentUrl])
  const filteredComments = useMemo(() => visibleComments.filter((c) => {
    const status = c.reviewStatus ?? 'open'
    if (filterStatus === 'open') return status === 'open'
    if (filterStatus === 'approved') return status === 'accepted'
    return true
  }), [visibleComments, filterStatus])
  const sortedComments = useMemo(() => [...filteredComments].sort((a, b) => {
    const aResolved = a.reviewStatus === 'accepted' || a.reviewStatus === 'rejected'
    const bResolved = b.reviewStatus === 'accepted' || b.reviewStatus === 'rejected'
    if (aResolved !== bResolved) return aResolved ? 1 : -1
    return 0
  }), [filteredComments])
  // Pin only renders if its selector still resolves on the current DOM.
  // Driven by a MutationObserver so we only recompute on real DOM changes,
  // and only re-render when the live set actually differs.
  const [liveCommentIds, setLiveCommentIds] = useState<Set<string>>(() => new Set())
  const filteredCommentsRef = useRef(filteredComments)
  filteredCommentsRef.current = filteredComments
  useEffect(() => {
    const recompute = () => {
      const next = new Set<string>()
      for (const c of filteredCommentsRef.current) {
        try { if (document.querySelector(c.selector)) next.add(c.id) } catch { /* invalid selector */ }
      }
      setLiveCommentIds((prev) => {
        if (prev.size !== next.size) return next
        for (const id of next) if (!prev.has(id)) return next
        return prev
      })
    }
    recompute()
    let pending = false
    const obs = new MutationObserver(() => {
      if (pending) return
      pending = true
      window.setTimeout(() => { pending = false; recompute() }, 250)
    })
    obs.observe(document.body, { childList: true, subtree: true, attributes: true })
    return () => obs.disconnect()
  }, [filteredComments])
  const commentCount = filteredComments.length

  // Only sync on scroll when a viewport-anchored popover is open or commenting.
  // Persisted pins/tooltip are absolute (page-anchored), so scroll moves them natively.
  needsPositionSyncRef.current = selectedPin !== null || mode !== 'idle' || !!target

  return (
    <div {...{ [WIDGET_ATTR]: '' }}>
      {/* Overlay — purely visual, clicks pass through */}
      {mode === 'selecting' && (
        <div
          {...{ [WIDGET_ATTR]: '' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483644,
            pointerEvents: 'none',
            background: 'transparent',
          }}
        />
      )}

      {mode === 'selecting' && <SelectingInstructionBar onExit={exitFeedbackMode} />}

      {/* Popover */}
      {mode === 'commenting' && target && (
        <>
          <div
            {...{ [WIDGET_ATTR]: '' }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483645,
              background: 'rgba(0, 0, 0, 0.05)',
            }}
            onClick={() => {
              setTarget(null)
              setComment('')
              clearImage()
              setSending(false)
              setMode('selecting')
            }}
          />
          <div
            ref={popoverRef}
            {...{ [WIDGET_ATTR]: '' }}
            style={{
              ...popoverStyle(),
              display: 'flex',
              flexDirection: 'column',
              width: comment.length > 0 || !!image ? 300 : 'auto',
              background: '#1e1e1e',
              borderRadius: comment.length > 0 || !!image ? 14 : 9999,
              padding: comment.length > 0 || !!image ? '10px 10px 6px' : '6px 6px 6px 10px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              transition: 'border-radius 0.2s, width 0.2s, padding 0.2s',
            }}
          >
            {/* Top row: avatar + input + send */}
            <div style={{ display: 'flex', alignItems: comment.length > 0 || !!image ? 'flex-start' : 'center', gap: 10 }}>
              {/* Avatar — click to edit name */}
              <button
                type="button"
                onClick={openNameEditor}
                title={authorName ? `Signed in as ${authorName} — click to change` : 'Set your name'}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#3b82f6', flexShrink: 0,
                  marginTop: comment.length > 0 ? 2 : 0,
                  border: 'none', padding: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                {getInitials(authorName) ?? ''}
              </button>
              {/* Textarea (single row when empty, expands when typing) */}
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (comment.trim()) handleSend()
                  }
                }}
                placeholder="Add a comment"
                rows={comment.length > 0 || !!image ? 3 : 1}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  minWidth: 0,
                  resize: 'none',
                  lineHeight: 1.5,
                  padding: 0,
                  transition: 'height 0.15s ease',
                }}
              />
              {/* Send button (inline when collapsed) */}
              {comment.length === 0 && (
                <button
                  onClick={handleSend}
                  disabled
                  aria-label="Send"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#333',
                    cursor: 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              )}
            </div>

            {/* Screenshot thumbnail (auto-captured) */}
            {imagePreviewUrl && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 6, paddingTop: 6, borderTop: '1px solid #333',
              }}>
                <img
                  src={imagePreviewUrl}
                  alt="captured element"
                  style={{ height: 48, maxWidth: 100, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid #333' }}
                />
                <span style={{ fontSize: 12, color: '#666', flex: 1 }}>Screenshot captured</span>
                <button
                  onClick={() => clearImage()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 2, display: 'flex', flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Bottom toolbar (visible when typing or image captured) */}
            {(comment.length > 0 || !!image) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid #333',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Emoji */}
                  <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, color: '#888' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>
                  {/* Mention */}
                  <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, color: '#888' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                    </svg>
                  </button>
                </div>
                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!comment.trim() || sending}
                  aria-label="Send"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: !comment.trim() || sending ? '#333' : '#3b82f6',
                    cursor: !comment.trim() || sending ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={!comment.trim() || sending ? '#666' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* New comment pin at clicked position */}
      {mode === 'commenting' && target && (() => {
        const { pageX, pageY } = fromPagePercent(target.x, target.y)
        return (
        <div
          {...{ [WIDGET_ATTR]: '' }}
          style={{
            position: 'absolute',
            left: pageX,
            top: pageY - 44,
            zIndex: 2147483646,
            pointerEvents: 'none',
            animation: 'fw-pin-glow-pulse 2.4s ease-in-out infinite',
            transformOrigin: 'bottom left',
          }}
        >
          <PinMarker />
        </div>
        )
      })()}

      {/* Persisted comment pins */}
      {pinsVisible && filteredComments.map((c, i) => {
        if (!liveCommentIds.has(c.id)) return null
        const { pageX: pinPageX, pageY: pinPageY } = fromPagePercent(c.x, c.y)
        const pinNumber = filteredComments.length - i
        const isSelected = selectedPin === c.id
        const isHovered = hoveredPin === c.id && !isSelected
        const isResolved = c.reviewStatus === 'accepted' || c.reviewStatus === 'rejected'
        return (
          <div key={c.id} {...{ [WIDGET_ATTR]: '' }}>
            {/* Pin marker */}
            <div
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPin(isSelected ? null : c.id)
              }}
              onMouseEnter={() => setHoveredPin(c.id)}
              onMouseLeave={() => setHoveredPin(null)}
              style={{
                position: 'absolute',
                left: pinPageX,
                top: pinPageY - 44,
                zIndex: isSelected ? 2147483646 : isHovered ? 2147483642 : 2147483640,
                cursor: 'pointer',
                transition: 'transform 0.15s, opacity 0.2s',
                transform: isSelected || isHovered ? 'scale(1.15)' : 'scale(1)',
                transformOrigin: 'bottom left',
                opacity: isResolved && !isSelected && !isHovered ? 0.4 : 1,
                animation: 'fw-pin-glow-pulse 2.4s ease-in-out infinite',
              }}
            >
              <PinMarker outline={isSelected} />
            </div>

            {/* Hover tooltip — same material as pin, expanded card */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  left: pinPageX,
                  top: pinPageY - 12,
                  zIndex: 2147483643,
                  pointerEvents: 'none',
                  transform: 'translateY(-100%)',
                }}
              >
                <div style={{
                  position: 'relative',
                  width: 280,
                  background: 'rgba(255, 255, 255, 0.65)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: '14px 14px 14px 0',
                  padding: 14,
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  animation: 'fw-tooltip-liquid 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
                  transformOrigin: '0% 100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: PIN_GRADIENT,
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  }}>
                    {getInitials(c.authorName) ?? ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{c.authorName ?? 'User'}</span>
                      <span style={{ fontSize: 12, color: '#888' }}>{timeAgo(c.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#333', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {c.body}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pin detail popover */}
            {isSelected && (() => {
              const avColor = avatarColor(c.id)
              const initial = getInitials(c.authorName) ?? (c.body[0] || 'U').toUpperCase()
              const stBadge = c.reviewStatus === 'accepted'
                ? { bg: '#ecfdf5', color: '#059669', label: 'Approved' }
                : c.reviewStatus === 'rejected'
                  ? { bg: '#fef2f2', color: '#dc2626', label: 'Rejected' }
                  : { bg: '#fffbeb', color: '#d97706', label: 'Pending' }
              return (
                <>
                  <div
                    onClick={() => setSelectedPin(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483645 }}
                  />
                  <div
                    style={{
                      ...pinPopoverStyle(c),
                      width: 300,
                      background: '#fff',
                      borderRadius: 16,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                      padding: 16,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      animation: 'fw-tooltip-in 0.15s ease both',
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: avColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 13, fontWeight: 700,
                      }}>
                        {initial}
                      </div>
                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{c.authorName ?? 'User'}</div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>
                          #{pinNumber} &middot; {timeAgo(c.createdAt)}
                        </div>
                      </div>
                      <PinActionCluster
                        key={c.id}
                        isResolved={isResolved}
                        onResolve={() => { updateStatus(c.id, 'accepted'); setSelectedPin(null) }}
                        onToggleResolve={() => { updateStatus(c.id, isResolved ? 'open' : 'accepted'); setSelectedPin(null) }}
                        onEdit={() => { setEditingId(c.id); setEditText(c.body) }}
                        onDelete={() => { deleteComment(c.id); setSelectedPin(null) }}
                      />
                    </div>

                    {/* Comment text — editable when editingId matches */}
                    {editingId === c.id ? (
                      <div style={{ marginBottom: c.imageUrl ? 10 : 14 }}>
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(c.id) }
                            if (e.key === 'Escape') { setEditingId(null) }
                          }}
                          rows={3}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            fontSize: 14, lineHeight: 1.5, color: '#111',
                            border: '1px solid #d4d4d4', borderRadius: 8,
                            padding: '8px 10px', fontFamily: 'inherit',
                            outline: 'none', resize: 'vertical', background: '#fff',
                          }}
                          onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                          onBlur={(e) => (e.target.style.borderColor = '#d4d4d4')}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}
                          >Cancel</button>
                          <button
                            onClick={() => saveEdit(c.id)}
                            style={{ fontSize: 12, color: '#fff', background: '#3b82f6', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontFamily: 'inherit' }}
                          >Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#333', marginBottom: c.imageUrl ? 10 : 14 }}>
                        {c.body}
                      </div>
                    )}

                    {/* Screenshot */}
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt=""
                        onClick={() => window.open(c.imageUrl!, '_blank')}
                        style={{ width: '100%', borderRadius: 8, border: '1px solid #eee', cursor: 'zoom-in', display: 'block', marginBottom: 14 }}
                      />
                    )}

                  </div>
                </>
              )
            })()}
          </div>
        )
      })}

      {/* Sidebar overlay — click outside to close */}
      <CommentSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        visibleComments={visibleComments}
        filteredComments={filteredComments}
        sortedComments={sortedComments}
        commentCount={commentCount}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        headerPopover={headerPopover}
        setHeaderPopover={setHeaderPopover}
        editingId={editingId}
        setEditingId={setEditingId}
        editText={editText}
        setEditText={setEditText}
        menuOpenId={menuOpenId}
        setMenuOpenId={setMenuOpenId}
        onCardClick={(id, selector) => { setSelectedPin(id); highlightElement(selector) }}
        onApprove={(id) => updateStatus(id, 'accepted')}
        onToggleResolve={(id, current) => updateStatus(id, current === 'accepted' ? 'open' : 'accepted')}
        onSaveEdit={saveEdit}
        onDelete={deleteComment}
        onEnterFeedback={enterFeedbackMode}
      />

      <FloatingPill
        pillRef={pillRef}
        pillPos={pillPos}
        draggingRef={dragging}
        didDragRef={didDrag}
        onPointerDown={onPillPointerDown}
        mode={mode}
        pinsVisible={pinsVisible}
        onTogglePins={() => setPinsVisible((v) => !v)}
        agentsRevealed={agentsRevealed}
        onOpenAgent={() => setAgentOpen(true)}
        badgeAnim={badgeAnim}
        commentCount={commentCount}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleMode={() => { if (mode !== 'idle') exitFeedbackMode(); else enterFeedbackMode() }}
      />

      {/* Agent bridge modal */}
      {agentOpen && <AgentBridgeModal apiBase={apiBase} projectId={projectId} onClose={() => setAgentOpen(false)} />}

      <FeedbackWidgetStyles />

      <NameModal
        open={showNameModal}
        hasExistingName={!!authorNameRef.current}
        nameInput={nameInput}
        onNameInputChange={setNameInput}
        onClose={() => { setShowNameModal(false); setNameInput('') }}
        onSubmit={(name) => {
          const wasCommenting = mode === 'commenting'
          saveAuthorName(name)
          setShowNameModal(false)
          setNameInput('')
          if (!wasCommenting && target) setMode('commenting')
        }}
      />
    </div>
  )
}
