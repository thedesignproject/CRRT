import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, SlidersHorizontal, Check } from 'lucide-react'
import { getSelector } from '../../lib/getSelector'
import { useScreenshotCapture } from '../../lib/screenshotCapture'
import { AgentBridgeModal } from '../AgentBridgeModal'
import type { ClickTarget, Comment, FeedbackWidgetProps, Mode, ReviewStatus } from './types'
import { AUTHOR_NAME_KEY, COMMENT_CUTOFF, PIN_GRADIENT, WIDGET_ATTR } from './constants'
import { fromPagePercentFixed, toPagePercent } from './coords'
import { avatarColor, getInitials, normalizeReviewStatus, timeAgo } from './format'
import { fetchProjectComments, patchReviewStatus as apiPatchReviewStatus, postComment } from './api'
import { FeedbackWidgetStyles } from './styles'
import { PinActionCluster, PinMarker } from './pin'
import { NameModal } from './modal'
import { SelectingInstructionBar } from './selecting'

function getElementFixedPos(
  selector: string,
  xPct: number,
  yPct: number,
): { left: number; top: number } | null {
  try {
    const el = document.querySelector(selector)
    if (!el) return null
    const rect = (el as HTMLElement).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return null
    const pageX = (xPct / 100) * document.documentElement.scrollWidth
    const pageY = (yPct / 100) * document.documentElement.scrollHeight
    return { left: pageX - window.scrollX, top: pageY - window.scrollY }
  } catch {
    return null
  }
}

function CarrotPixelIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', display: 'block' }}
      aria-hidden="true"
    >
      <rect x="7" y="1" width="2" height="2" fill="#5ABF35" />
      <rect x="5" y="2" width="2" height="2" fill="#3E9020" />
      <rect x="9" y="2" width="2" height="2" fill="#5ABF35" />
      <rect x="6" y="3" width="4" height="1" fill="#5ABF35" />
      <rect x="4" y="4" width="8" height="1" fill="#E8853D" />
      <rect x="11" y="4" width="1" height="1" fill="#B85F1F" />
      <rect x="4" y="5" width="8" height="1" fill="#E8853D" />
      <rect x="11" y="5" width="1" height="1" fill="#B85F1F" />
      <rect x="5" y="6" width="6" height="1" fill="#E8853D" />
      <rect x="10" y="6" width="1" height="1" fill="#B85F1F" />
      <rect x="5" y="7" width="6" height="1" fill="#E8853D" />
      <rect x="10" y="7" width="1" height="1" fill="#B85F1F" />
      <rect x="5" y="8" width="5" height="1" fill="#E8853D" />
      <rect x="9" y="8" width="1" height="1" fill="#B85F1F" />
      <rect x="6" y="9" width="4" height="1" fill="#E8853D" />
      <rect x="9" y="9" width="1" height="1" fill="#B85F1F" />
      <rect x="6" y="10" width="3" height="1" fill="#E8853D" />
      <rect x="8" y="10" width="1" height="1" fill="#B85F1F" />
      <rect x="7" y="11" width="2" height="1" fill="#E8853D" />
      <rect x="8" y="11" width="1" height="1" fill="#B85F1F" />
      <rect x="7" y="12" width="1" height="1" fill="#E8853D" />
      <rect x="8" y="12" width="1" height="1" fill="#B85F1F" />
      <rect x="7" y="13" width="1" height="1" fill="#B85F1F" />
    </svg>
  )
}

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

  const pendingSendAfterName = useRef(false)

  function handleNameSubmit() {
    if (!nameInput.trim()) return
    const wasCommenting = mode === 'commenting'
    saveAuthorName(nameInput)
    setShowNameModal(false)
    setNameInput('')
    if (pendingSendAfterName.current) {
      pendingSendAfterName.current = false
      handleSend()
    } else if (!wasCommenting && target) {
      setMode('commenting')
    }
  }

  function handleNameCancel() {
    setShowNameModal(false)
    setNameInput('')
  }

  // Draggable pill state — null means CSS default (bottom: 24, right: 24)
  const [draggedPos, setDraggedPos] = useState<{ x: number; y: number } | null>(null)
  const [pillHover, setPillHover] = useState(false)
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
      // CSS bottom/right handles viewport resize automatically when not dragged
      setDraggedPos(prev => prev ? ({
        x: Math.max(0, Math.min(window.innerWidth - 180, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 56, prev.y)),
      }) : null)
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
  const [sidebarTab, setSidebarTab] = useState<'comments' | 'ready'>('comments')
  const [pinsVisible, setPinsVisible] = useState(true)
  const [agentsRevealed, setAgentsRevealed] = useState(false)
  const [headerPopover, setHeaderPopover] = useState<'filter' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // Synchronous guard — state updates are async, so double-firing handleSend
  // in the same tick (e.g. Cmd+Enter held down) would otherwise slip past `sending`.
  const sendingRef = useRef(false)

  const [successToast, setSuccessToast] = useState(false)

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
    el.style.outline = '2px solid rgba(232, 133, 61, 0.6)'
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
      setSidebarOpen(false)
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

    if (!authorNameRef.current) {
      pendingSendAfterName.current = true
      setNameInput('')
      setShowNameModal(true)
      return
    }

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

      setSuccessToast(true)
      setTimeout(() => setSuccessToast(false), 2000)

      setTarget(null)
      setComment('')
      clearImage()
      setHovered(null)
      setMode('selecting')
      setSidebarOpen(true)
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

      // Shift+A — open Agent bridge modal directly (no reveal step now that aux chips are gone)
      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        setAgentsRevealed(true)
        setAgentOpen(true)
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
    setSidebarOpen(false)
    setMode('selecting')
  }

  // --- Drag handlers for pill ---
  function onPillPointerDown(e: React.PointerEvent) {
    dragging.current = true
    didDrag.current = false
    const rect = pillRef.current?.getBoundingClientRect()
    /* v8 ignore next 2 */
    dragOffset.current = {
      x: e.clientX - (rect?.left ?? e.clientX),
      y: e.clientY - (rect?.top ?? e.clientY),
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return
      didDrag.current = true
      const x = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.y))
      setDraggedPos({ x, y })
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

  // External trigger — landing page "Drop a carrot" buttons dispatch this event.
  useEffect(() => {
    const handler = () => { if (mode === 'idle') enterFeedbackMode() }
    window.addEventListener('crrt:activate', handler)
    return () => window.removeEventListener('crrt:activate', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
    const popH = 300
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
    // Tab gate first: "Ready for agent" only shows approved comments (ready to ship).
    if (sidebarTab === 'ready' && status !== 'accepted') return false
    if (filterStatus === 'open') return status === 'open'
    if (filterStatus === 'approved') return status === 'accepted'
    return true
  }), [visibleComments, filterStatus, sidebarTab])
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
  needsPositionSyncRef.current = selectedPin !== null || mode !== 'idle' || !!target || (pinsVisible && filteredComments.length > 0)

  const pathDisplay = (window.location.pathname || '/').slice(0, 28) || '/'
  const avatarInitial = authorName ? (getInitials(authorName) ?? authorName[0]?.toUpperCase() ?? 'U') : 'U'
  const badgeAnimation = badgeAnim ? 'fw-badge-pop 0.4s ease' : 'crrt-pulse 2.4s ease-in-out infinite'

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

      {/* Instruction tooltip */}
      {mode === 'selecting' && <SelectingInstructionBar onCancel={exitFeedbackMode} />}

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
              width: 340,
              background: '#181818',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 14,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              boxShadow: '0 12px 32px rgba(10, 10, 10, 0.4), 0 2px 8px rgba(10, 10, 10, 0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Header: time pill (Phosphor amber) + location chip (Carrot tint) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px 8px',
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(255, 176, 0, 0.18)',
                color: '#FFB000',
                fontFamily: "'VT323', 'JetBrains Mono', monospace",
                fontSize: 13,
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                Just now
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(232, 133, 61, 0.15)',
                color: '#E8853D',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                lineHeight: 1,
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pathDisplay}
                </span>
              </span>
            </div>

            {/* Textarea */}
            <div style={{ padding: '0 14px 4px' }}>
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
                placeholder="Leave your comment…"
                rows={3}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'none',
                  padding: 0,
                }}
              />
            </div>

            {/* Screenshot thumbnail */}
            {imagePreviewUrl && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                margin: '0 14px 6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
              }}>
                <img
                  src={imagePreviewUrl}
                  alt="captured element"
                  style={{ height: 36, width: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <span style={{ fontSize: 12, color: '#A8A29A', flex: 1, fontFamily: 'inherit' }}>Screenshot</span>
                <button
                  onClick={() => clearImage()}
                  aria-label="Remove screenshot"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6560', padding: 2, display: 'flex', flexShrink: 0, borderRadius: 4 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Footer toolbar: avatar + emoji + cancel + send */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px 10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              marginTop: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {authorName && (
                  <button
                    title={`Signed in as ${authorName}`}
                    onClick={openNameEditor}
                    style={{
                      width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: avatarColor(authorName),
                      border: 'none', borderRadius: '50%',
                      cursor: 'pointer', flexShrink: 0,
                      color: '#FFFFFF', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    {avatarInitial}
                  </button>
                )}
                <button
                  aria-label="Add emoji"
                  style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, color: '#6B6560' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
                <button
                  aria-label="React"
                  style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, color: '#6B6560' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => {
                    setTarget(null)
                    setComment('')
                    clearImage()
                    setSending(false)
                    setMode('selecting')
                  }}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 9999,
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#A8A29A',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#FFFFFF' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A29A' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!comment.trim() || sending}
                  aria-label="Send"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 14px',
                    borderRadius: 9999,
                    border: '1px solid ' + (!comment.trim() || sending ? 'rgba(255,255,255,0.06)' : '#B85F1F'),
                    background: !comment.trim() || sending ? 'rgba(255,255,255,0.04)' : '#E8853D',
                    color: !comment.trim() || sending ? '#6B6560' : '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: !comment.trim() || sending ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={(e) => { if (comment.trim() && !sending) e.currentTarget.style.background = '#B85F1F' }}
                  onMouseLeave={(e) => { if (comment.trim() && !sending) e.currentTarget.style.background = '#E8853D' }}
                >
                  <span>Send</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* New comment pin at clicked position */}
      {mode === 'commenting' && target && (() => {
        const { fixedX, fixedY } = fromPagePercentFixed(target.x, target.y)
        return (
          <div
            {...{ [WIDGET_ATTR]: '' }}
            style={{
              position: 'fixed',
              left: fixedX,
              top: fixedY - 11,
              zIndex: 2147483646,
              pointerEvents: 'none',
              animation: 'fw-pin-drop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
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
        const pinPos = getElementFixedPos(c.selector, c.x, c.y)
        if (!pinPos) return null
        const pinNumber = filteredComments.length - i
        const isSelected = selectedPin === c.id
        const isHovered = hoveredPin === c.id && !isSelected
        const isResolved = c.reviewStatus === 'accepted' || c.reviewStatus === 'rejected'
        const pinAuthor = c.authorName ?? 'User'
        return (
          <div key={c.id} {...{ [WIDGET_ATTR]: '' }}>
            {/* Pin marker */}
            <div
              data-fw-pin
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPin(isSelected ? null : c.id)
              }}
              onMouseEnter={() => setHoveredPin(c.id)}
              onMouseLeave={() => setHoveredPin(null)}
              style={{
                position: 'fixed',
                left: pinPos.left,
                top: pinPos.top - 11,
                zIndex: isSelected ? 2147483646 : isHovered ? 2147483642 : 2147483640,
                cursor: 'pointer',
                transition: 'transform 0.15s, opacity 0.2s',
                transform: isSelected || isHovered ? 'scale(1.15)' : 'scale(1)',
                transformOrigin: 'bottom left',
                opacity: isResolved && !isSelected && !isHovered ? 0.4 : 1,
              }}
            >
              <PinMarker outline={isSelected} />
            </div>

            {/* Hover tooltip — dark CRRT glass */}
            {isHovered && (
              <div
                style={{
                  position: 'fixed',
                  left: pinPos.left,
                  top: pinPos.top - 11,
                  zIndex: 2147483643,
                  pointerEvents: 'none',
                  transform: 'translateY(-100%)',
                }}
              >
                <div style={{
                  width: 280,
                  background: 'rgba(18, 18, 18, 0.96)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '14px 14px 14px 0',
                  padding: 14,
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
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
                  }}>
                    {getInitials(c.authorName) ?? ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{pinAuthor}</span>
                      <span style={{ fontSize: 12, color: '#6B6560' }}>{timeAgo(c.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#E8E5DF', lineHeight: 1.4, wordBreak: 'break-word' }}>
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
              const bodyMarginBottom = c.imageUrl ? 10 : 14
              return (
                <>
                  <div
                    data-fw-pin-backdrop
                    onClick={() => setSelectedPin(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483645 }}
                  />
                  <div
                    style={{
                      ...pinPopoverStyle(c),
                      width: 300,
                      background: '#181818',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 16,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                      padding: 16,
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                      animation: 'fw-tooltip-in 0.15s ease both',
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: avColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 13, fontWeight: 700,
                      }}>
                        {initial}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 2 }}>{pinAuthor}</div>
                        <div style={{ fontSize: 12, color: '#6B6560' }}>
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
                            fontSize: 14, lineHeight: 1.5, color: '#FFFFFF',
                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                            padding: '8px 10px', fontFamily: 'inherit',
                            outline: 'none', resize: 'vertical', background: '#222',
                          }}
                          onFocus={(e) => (e.target.style.borderColor = '#E8853D')}
                          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: 12, color: '#A8A29A', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}
                          >Cancel</button>
                          <button
                            onClick={() => saveEdit(c.id)}
                            style={{ fontSize: 12, color: '#fff', background: '#E8853D', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontFamily: 'inherit' }}
                          >Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#E8E5DF', marginBottom: bodyMarginBottom }}>
                        {c.body}
                      </div>
                    )}

                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt=""
                        onClick={() => window.open(c.imageUrl!, '_blank')}
                        style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', cursor: 'zoom-in', display: 'block', marginBottom: 14 }}
                      />
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )
      })}

      {/* Sidebar overlay — only when NOT selecting/commenting, so user can click page elements to drop pins */}
      {sidebarOpen && mode === 'idle' && (
        <div
          {...{ [WIDGET_ATTR]: '' }}
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483646 }}
        />
      )}

      {/* Reviewer Sidebar */}
      <div
        {...{ [WIDGET_ATTR]: '' }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 340,
          zIndex: 2147483647,
          background: '#0A0A0A',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          boxShadow: sidebarOpen ? '-8px 0 32px rgba(0,0,0,0.5)' : 'none',
          borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Tabs row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          gap: 4,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          <div style={{
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 9999,
            padding: 3,
            gap: 2,
            flex: 1,
          }}>
            {([
              { id: 'comments', label: 'Comments' },
              { id: 'ready', label: 'Ready for agent' },
            ] as const).map((t) => {
              const active = sidebarTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setSidebarTab(t.id)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    background: active ? 'rgba(232, 133, 61, 0.18)' : 'transparent',
                    color: active ? '#E8853D' : '#A8A29A',
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#FFFFFF' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#A8A29A' }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Close button — closes sidebar AND exits selecting if active */}
          <button
            onClick={() => { if (mode !== 'idle') exitFeedbackMode(); setSidebarOpen(false) }}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#A8A29A', cursor: 'pointer', padding: 8, borderRadius: 6, display: 'flex', transition: 'color 0.15s, background 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#A8A29A'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Title + filter row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px 10px', position: 'relative' }}>
          <span style={{ fontSize: 13, color: '#FFFFFF', flex: 1, fontWeight: 500 }}>
            {sidebarTab === 'ready' ? 'Ready for agent' : 'All comments'}
            <span style={{ marginLeft: 8, color: '#6B6560', fontSize: 12, fontWeight: 400 }}>{commentCount}</span>
          </span>

          {/* Filter button */}
          <button
            onClick={(e) => { e.stopPropagation(); setHeaderPopover((v) => v === 'filter' ? null : 'filter') }}
            title="Filter"
            style={{
              background: headerPopover === 'filter' ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              color: filterStatus !== 'all' ? '#E8853D' : '#6B6560',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { if (headerPopover !== 'filter' && filterStatus === 'all') e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={(e) => { if (headerPopover !== 'filter' && filterStatus === 'all') e.currentTarget.style.color = '#6B6560' }}
          >
            <SlidersHorizontal style={{ width: 14, height: 14 }} />
          </button>

          {/* Filter popover */}
          {headerPopover === 'filter' && (
            <>
              <div
                onClick={() => setHeaderPopover(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 38,
                  marginTop: 4,
                  zIndex: 100001,
                  background: '#222',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: 4,
                  minWidth: 180,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  animation: 'fw-slide-in 0.15s ease both',
                }}
              >
                {(['all', 'open', 'approved'] as const).map((f) => {
                  const active = filterStatus === f
                  const label = f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Approved'
                  return (
                    <button
                      key={f}
                      onClick={() => { setFilterStatus(f); setHeaderPopover(null) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: 13,
                        fontWeight: 500,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: '#ddd',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e2e')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {active && <Check style={{ width: 14, height: 14, color: '#E8853D' }} />}
                      </span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Comment list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {sortedComments.length === 0 && (
            <div style={{ color: '#555', fontSize: 13, textAlign: 'center', marginTop: 40, padding: '0 24px', lineHeight: 1.5 }}>
              {visibleComments.length === 0
                ? 'No comments yet'
                : sidebarTab === 'ready'
                  ? 'Approve comments to queue them here'
                  : 'No comments match this filter'}
            </div>
          )}
          {sortedComments.map((c, i) => {
              const pinNum = filteredComments.length - filteredComments.indexOf(c)
              const isResolved = c.reviewStatus === 'accepted' || c.reviewStatus === 'rejected'
              const isPending = !c.reviewStatus || c.reviewStatus === 'open'
              const isEditing = editingId === c.id
              const initial = getInitials(c.authorName) ?? (c.body[0] || 'U').toUpperCase()
              const isMenuOpen = menuOpenId === c.id
              return (
                <div
                  key={c.id}
                  className="fw-sidebar-card"
                  onClick={() => { if (!isEditing && !isMenuOpen) { setSelectedPin(c.id); highlightElement(c.selector) } }}
                  style={{
                    padding: '14px 16px',
                    cursor: isEditing ? 'default' : 'pointer',
                    position: 'relative',
                    zIndex: isMenuOpen ? 100000 : 'auto',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    opacity: isResolved ? 0.55 : 1,
                    transition: 'background 0.1s, opacity 0.2s',
                    animation: sidebarOpen ? `fw-slide-in 0.2s ease ${i * 0.04}s both` : 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Top row: avatar + name + time + meta on right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: isResolved ? '#2C2C2C' : avatarColor(c.authorName ?? c.id),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#FFFFFF', fontSize: 11, fontWeight: 700,
                      fontFamily: 'inherit',
                    }}>
                      {initial}
                    </div>
                    {/* Name + time */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.authorName ?? 'User'}
                      </span>
                      <span style={{ fontSize: 12, color: '#6B6560', flexShrink: 0 }}>
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    {/* Meta on right: #N + URL */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span style={{ fontSize: 11, color: '#6B6560' }}>#{pinNum}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                  </div>

                  {/* Body */}
                  {isEditing ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(c.id) }
                          if (e.key === 'Escape') { setEditingId(null) }
                        }}
                        rows={2}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          fontSize: 14, lineHeight: 1.5, color: '#FFFFFF',
                          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                          padding: '8px 10px', fontFamily: 'inherit',
                          outline: 'none', resize: 'none', background: '#181818',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = '#E8853D')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: '#A8A29A', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={() => saveEdit(c.id)} style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 600, background: '#E8853D', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontFamily: 'inherit' }}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditText(c.body) }}
                        style={{
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          color: isResolved ? '#6B6560' : '#E8E5DF',
                          cursor: 'text',
                          marginLeft: 32,
                          wordBreak: 'break-word',
                        }}
                      >
                        {c.body}
                      </div>
                      {c.imageUrl && (
                        <img
                          src={c.imageUrl}
                          alt=""
                          onClick={(e) => { e.stopPropagation(); window.open(c.imageUrl!, '_blank') }}
                          style={{
                            marginTop: 8,
                            marginLeft: 32,
                            maxWidth: 'calc(100% - 32px)',
                            borderRadius: 6,
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'zoom-in',
                            display: 'block',
                            filter: isResolved ? 'grayscale(0.7) brightness(0.5)' : 'none',
                          }}
                        />
                      )}
                      {/* Reply link (visual only — affordance, no thread logic yet) */}
                      <button
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: 8,
                          marginLeft: 32,
                          padding: 0,
                          fontSize: 12,
                          color: '#6B6560',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'color 150ms ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
                      >
                        Reply
                      </button>
                    </>
                  )}

                  {/* Hover actions (Approve + More) — bottom-right corner, only on card hover */}
                  <div
                    className="fw-card-actions"
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 12,
                      display: 'none',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(10, 10, 10, 0.7)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      borderRadius: 6,
                      padding: 2,
                    }}
                  >
                    {isPending && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateStatus(c.id, 'accepted') }}
                        title="Approve"
                        style={{
                          width: 22, height: 22, borderRadius: 4, border: 'none',
                          background: 'transparent', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: '#A8A29A', padding: 0,
                          transition: 'background 150ms ease, color 150ms ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#E8853D' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A29A' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : c.id) }}
                      title="More"
                      style={{
                        width: 22, height: 22, borderRadius: 4, border: 'none',
                        background: isMenuOpen ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#A8A29A', padding: 0,
                      }}
                      onMouseEnter={(e) => { if (!isMenuOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={(e) => { if (!isMenuOpen) e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                    </button>
                  </div>

                  {/* Dropdown menu */}
                  {isMenuOpen && (
                    <>
                    <div
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(null) }}
                      style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                    />
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: 34, right: 12, zIndex: 99999,
                        background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 8,
                        padding: '4px 0', minWidth: 160,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        animation: 'fw-tooltip-in 0.1s ease both',
                      }}
                    >
                      <button
                        onClick={() => { updateStatus(c.id, c.reviewStatus === 'accepted' ? 'open' : 'accepted'); setMenuOpenId(null) }}
                        style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ccc', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        {c.reviewStatus === 'accepted' ? 'Reopen' : 'Approve'}
                      </button>
                      <button
                        onClick={() => { setEditingId(c.id); setEditText(c.body); setMenuOpenId(null) }}
                        style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ccc', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        Edit
                      </button>
                      <div style={{ height: 1, background: '#3a3a3a', margin: '4px 0' }} />
                      <button
                        onClick={() => { deleteComment(c.id); setMenuOpenId(null) }}
                        style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ef4444', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        Delete
                      </button>
                    </div>
                    </>
                  )}
                </div>
              )
            })}
        </div>

        {/* Footer — toggles "+ Leave feedback" / "Cancel" based on mode. Sidebar stays open. */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #2a2a2a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {mode === 'idle' ? (
            <button
              onClick={() => enterFeedbackMode()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                height: 40,
                padding: '0 18px 0 6px',
                borderRadius: 9999,
                background: '#E8853D',
                border: '1px solid #B85F1F',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 10px rgba(232, 133, 61, 0.32)',
                transition: 'background 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#B85F1F')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#E8853D')}
            >
              <CarrotPixelIcon size={20} />
              <span>Leave feedback</span>
            </button>
          ) : (
            <button
              onClick={() => { exitFeedbackMode(); setSidebarOpen(false) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 18px',
                borderRadius: 9999,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#A8A29A',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 220ms cubic-bezier(0.16, 1, 0.3, 1), color 220ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#FFFFFF' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A29A' }}
            >
              <X style={{ width: 14, height: 14 }} />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* CRRT trigger — single pill. Hidden while sidebar is open (sidebar owns the chrome). */}
      <div
        ref={pillRef}
        {...{ [WIDGET_ATTR]: '' }}
        onPointerDown={onPillPointerDown}
        onMouseEnter={() => setPillHover(true)}
        onMouseLeave={() => setPillHover(false)}
        style={{
          position: 'fixed',
          ...(draggedPos ? { left: draggedPos.x, top: draggedPos.y } : { bottom: 24, right: 24 }),
          zIndex: 2147483647,
          cursor: dragging.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          opacity: (sidebarOpen || mode !== 'idle') ? 0 : 1,
          transform: (sidebarOpen || mode !== 'idle') ? 'translateY(8px)' : 'translateY(0)',
          pointerEvents: (sidebarOpen || mode !== 'idle') ? 'none' : 'auto',
          transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* Primary pill */}
          <button
            type="button"
            onClick={(e) => {
              if (didDrag.current) { e.preventDefault(); return }
              enterFeedbackMode()
            }}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              height: 44,
              padding: '0 18px 0 6px',
              borderRadius: 9999,
              background: 'rgba(10, 10, 10, 0.72)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              cursor: dragging.current ? 'grabbing' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 12px 28px rgba(10, 10, 10, 0.32), 0 2px 6px rgba(10, 10, 10, 0.18)',
              transition: 'background 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <CarrotPixelIcon size={22} />
            <span>Drop a carrot</span>
            {mode === 'idle' && commentCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  border: '1.5px solid rgba(10, 10, 10, 0.9)',
                  background: '#E8853D',
                  animation: badgeAnimation,
                }}
              />
            )}
          </button>

          {/* Drag handle — Granola-style. Appears below the pill on hover. Visual only; drag works on the whole wrapper. */}
          {mode === 'idle' && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                bottom: -12,
                transform: `translate(-50%, ${pillHover && !dragging.current ? '0' : '-8px'})`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                height: 14,
                padding: '0 8px',
                borderRadius: '0 0 9999px 9999px',
                background: 'rgba(10, 10, 10, 0.72)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
                borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                opacity: pillHover && !dragging.current ? 1 : 0,
                pointerEvents: 'none',
                transition: 'opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.5)',
                    display: 'block',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Success toast */}
      {successToast && (
        <div
          {...{ [WIDGET_ATTR]: '' }}
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            zIndex: 2147483647,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 9999,
            background: 'rgba(31, 58, 47, 0.96)',
            border: '1px solid rgba(232, 133, 61, 0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: '#E8853D',
            whiteSpace: 'nowrap',
            animation: 'fw-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
            pointerEvents: 'none',
          }}
        >
          <CarrotPixelIcon size={14} />
          <span>Carrot dropped</span>
        </div>
      )}

      {/* Agent bridge modal */}
      {agentOpen && <AgentBridgeModal apiBase={apiBase} projectId={projectId} onClose={() => setAgentOpen(false)} />}

      <FeedbackWidgetStyles />

      {showNameModal && (
        <NameModal
          value={nameInput}
          onChange={setNameInput}
          onSubmit={handleNameSubmit}
          onCancel={handleNameCancel}
          existingName={authorNameRef.current}
        />
      )}
    </div>
  )
}
