import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScreenshotCapture } from '../../lib/screenshotCapture'
import { AgentBridgeModal } from '../AgentBridgeModal'
import type { ClickTarget, Comment, FeedbackWidgetProps, FilterValue, Mode, ReviewStatus } from './types'
import { COMMENT_CUTOFF, WIDGET_ATTR } from './constants'
import { fetchProjectComments, patchReviewStatus as apiPatchReviewStatus, postComment } from './api'
import { isResolved } from './format'
import { FeedbackWidgetStyles } from './styles'
import { PinMarker } from './pin/PinMarker'
import { CommentPin } from './pin/CommentPin'
import { CommentInputPopover } from './pin/CommentInputPopover'
import { useAuthorName } from './hooks/useAuthorName'
import { useCurrentUrl } from './hooks/useCurrentUrl'
import { useElementSelection } from './hooks/useElementSelection'
import { useLiveSelectors } from './hooks/useLiveSelectors'
import { usePillDrag } from './hooks/usePillDrag'
import { usePositionSync } from './hooks/usePositionSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { SelectingInstructionBar } from './modal/SelectingInstructionBar'
import { NameModal } from './modal/NameModal'
import { CommentSidebar } from './sidebar/CommentSidebar'
import { FloatingPill } from './pill/FloatingPill'

export function FeedbackWidget({ projectId, apiBase }: FeedbackWidgetProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [target, setTarget] = useState<ClickTarget | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

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

  const { pillRef, pillPos, draggingRef: dragging, didDragRef: didDrag, onPointerDown: onPillPointerDown } = usePillDrag()

  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const currentUrl = useCurrentUrl()

  const [comments, setComments] = useState<Comment[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badgeAnim, setBadgeAnim] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<FilterValue>('all')
  const [pinsVisible, setPinsVisible] = useState(true)
  const [agentsRevealed, setAgentsRevealed] = useState(false)
  const [headerPopover, setHeaderPopover] = useState<'filter' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Synchronous guard — state updates are async, so double-firing handleSend
  // in the same tick (e.g. Cmd+Enter held down) would otherwise slip past `sending`.
  const sendingRef = useRef(false)

  const { image, previewUrl: imagePreviewUrl, capture: captureImage, clear: clearImage, toBase64: encodeImage } = useScreenshotCapture()

  useEffect(() => {
    let cancelled = false
    fetchProjectComments(apiBase, projectId).then((nextComments) => {
      if (!cancelled) setComments(nextComments)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, apiBase])

  useEffect(() => {
    if (!agentsRevealed) setAgentOpen(false)
  }, [agentsRevealed])

  useElementSelection({
    mode,
    onPick: (pickedTarget, el) => {
      setSelectedPin(null)
      clearImage()
      setTarget(pickedTarget)
      captureImage(el)
      if (!authorNameRef.current) {
        setShowNameModal(true)
        return
      }
      setMode('commenting')
    },
  })

  useEffect(() => {
    if (mode === 'commenting' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [mode])

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
        authorName: data.authorName ?? authorNameRef.current,
      }

      setComments((prev) => [newComment, ...prev])

      setBadgeAnim(true)
      setTimeout(() => setBadgeAnim(false), 400)

      setTarget(null)
      setComment('')
      clearImage()
      setMode('selecting')
    } catch (err) {
      console.warn('[FeedbackWidget] API error:', err)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [comment, target, projectId, apiBase, encodeImage, clearImage])

  useKeyboardShortcuts({
    mode,
    onEscape: () => {
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
    },
    onCmdEnter: handleSend,
    onToggleAgents: () => setAgentsRevealed((v) => !v),
    onToggleMode: () => { if (mode !== 'idle') exitFeedbackMode(); else enterFeedbackMode() },
    onEnterFeedback: enterFeedbackMode,
    onToggleSidebar: () => setSidebarOpen((v) => !v),
    onTogglePins: () => setPinsVisible((v) => !v),
  })

  function exitFeedbackMode() {
    setMode('idle')
    setTarget(null)
    setComment('')
    clearImage()
    setSending(false)
    setSelectedPin(null)
  }

  function enterFeedbackMode() {
    setMode('selecting')
  }

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
    const aResolved = isResolved(a.reviewStatus)
    const bResolved = isResolved(b.reviewStatus)
    if (aResolved !== bResolved) return aResolved ? 1 : -1
    return 0
  }), [filteredComments])
  const liveCommentIds = useLiveSelectors(filteredComments)
  const commentCount = filteredComments.length

  // Only sync on scroll when a viewport-anchored popover is open or commenting.
  // Persisted pins/tooltip are absolute (page-anchored), so scroll moves them natively.
  usePositionSync(selectedPin !== null || mode !== 'idle' || !!target)

  return (
    <div {...{ [WIDGET_ATTR]: '' }}>
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
        const resolved = isResolved(c.reviewStatus)
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
            onToggleResolve={() => { updateStatus(c.id, resolved ? 'open' : 'accepted'); setSelectedPin(null) }}
            onStartEdit={() => { setEditingId(c.id); setEditText(c.body) }}
            onSaveEdit={() => saveEdit(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onEditTextChange={setEditText}
            onDelete={() => { deleteComment(c.id); setSelectedPin(null) }}
          />
        )
      })}

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
