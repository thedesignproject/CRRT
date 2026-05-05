import type { CSSProperties, RefObject } from 'react'
import { WIDGET_ATTR } from '../constants'
import { fromPagePercent, fromPagePercentFixed } from '../coords'
import { getInitials } from '../format'
import type { ClickTarget } from '../types'
import { PinMarker } from './PinMarker'

interface CommentInputPopoverProps {
  target: ClickTarget
  comment: string
  onCommentChange: (s: string) => void
  sending: boolean
  imagePreviewUrl: string | null
  hasImage: boolean
  authorName: string | undefined
  onSend: () => void
  onCancel: () => void
  onEditName: () => void
  onClearImage: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

function popoverStyle(target: ClickTarget): CSSProperties {
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

export function CommentInputPopover({
  target,
  comment,
  onCommentChange,
  sending,
  imagePreviewUrl,
  hasImage,
  authorName,
  onSend,
  onCancel,
  onEditName,
  onClearImage,
  textareaRef,
}: CommentInputPopoverProps) {
  const expanded = comment.length > 0 || hasImage
  const { pageX, pageY } = fromPagePercent(target.x, target.y)

  return (
    <>
      <div
        {...{ [WIDGET_ATTR]: '' }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483645,
          background: 'rgba(0, 0, 0, 0.05)',
        }}
        onClick={onCancel}
      />
      <div
        {...{ [WIDGET_ATTR]: '' }}
        style={{
          ...popoverStyle(target),
          display: 'flex',
          flexDirection: 'column',
          width: expanded ? 300 : 'auto',
          background: '#1e1e1e',
          borderRadius: expanded ? 14 : 9999,
          padding: expanded ? '10px 10px 6px' : '6px 6px 6px 10px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          transition: 'border-radius 0.2s, width 0.2s, padding 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: expanded ? 'flex-start' : 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onEditName}
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
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (comment.trim()) onSend()
              }
            }}
            placeholder="Add a comment"
            rows={expanded ? 3 : 1}
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
          {comment.length === 0 && (
            <button
              onClick={onSend}
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
              onClick={onClearImage}
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

        {expanded && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid #333',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
            <button
              onClick={onSend}
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
    </>
  )
}
