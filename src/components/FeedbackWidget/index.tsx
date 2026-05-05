import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSelector } from '../../lib/getSelector'
import { useScreenshotCapture } from '../../lib/screenshotCapture'
import { AgentBridgeModal } from '../AgentBridgeModal'
import type { ClickTarget, Comment, FeedbackWidgetProps, Mode, ReviewStatus } from './types'
import { COMMENT_CUTOFF, WIDGET_ATTR } from './constants'
import { fromPagePercent, fromPagePercentFixed, toPagePercent } from './coords'
import { avatarColor, getInitials, normalizeReviewStatus, timeAgo } from './format'
import { fetchProjectComments, patchReviewStatus as apiPatchReviewStatus, postComment } from './api'
import { FeedbackWidgetStyles } from './styles'
import { PinMarker } from './pin/PinMarker'
import { CommentPin } from './pin/CommentPin'
import { CommentInputPopover } from './pin/CommentInputPopover'
import { useAuthorName } from './hooks/useAuthorName'
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

  const {
    authorName,
    authorNameRef,
    showNameModal,
    setShowNameModal,
    nameInput,
    setNameInput,
    saveAuthorName,
    openNameEditor,
  } = useAuthorName()

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

      {mode === 'commenting' && target && (
        <CommentInputPopover
          target={target}
          comment={comment}
          onCommentChange={setComment}
          sending={sending}
          imagePreviewUrl={imagePreviewUrl}
          hasImage={!!image}
          authorName={authorName}
          onSend={handleSend}
          onCancel={() => {
            setTarget(null)
            setComment('')
            clearImage()
            setSending(false)
            setMode('selecting')
          }}
          onEditName={openNameEditor}
          onClearImage={clearImage}
          textareaRef={textareaRef}
        />
      )}

      {pinsVisible && filteredComments.map((c, i) => {
        if (!liveCommentIds.has(c.id)) return null
        const pinNumber = filteredComments.length - i
        const isSelected = selectedPin === c.id
        const isHovered = hoveredPin === c.id && !isSelected
        const isResolved = c.reviewStatus === 'accepted' || c.reviewStatus === 'rejected'
        return (
          <CommentPin
            key={c.id}
            comment={c}
            pinNumber={pinNumber}
            isSelected={isSelected}
            isHovered={isHovered}
            isEditing={editingId === c.id}
            editText={editText}
            onSelect={() => setSelectedPin(isSelected ? null : c.id)}
            onClearSelection={() => setSelectedPin(null)}
            onHoverEnter={() => setHoveredPin(c.id)}
            onHoverLeave={() => setHoveredPin(null)}
            onApprove={() => { updateStatus(c.id, 'accepted'); setSelectedPin(null) }}
            onToggleResolve={() => { updateStatus(c.id, isResolved ? 'open' : 'accepted'); setSelectedPin(null) }}
            onStartEdit={() => { setEditingId(c.id); setEditText(c.body) }}
            onSaveEdit={() => saveEdit(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onEditTextChange={setEditText}
            onDelete={() => { deleteComment(c.id); setSelectedPin(null) }}
          />
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
