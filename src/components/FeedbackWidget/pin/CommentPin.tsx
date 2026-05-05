import type { CSSProperties } from 'react'
import { PIN_GRADIENT, WIDGET_ATTR } from '../constants'
import { fromPagePercent, fromPagePercentFixed } from '../coords'
import { avatarColor, getInitials, isResolved as isResolvedStatus, timeAgo } from '../format'
import type { Comment } from '../types'
import { PinMarker } from './PinMarker'
import { PinActionCluster } from './PinActionCluster'

interface CommentPinProps {
  comment: Comment
  pinNumber: number
  isSelected: boolean
  isHovered: boolean
  isEditing: boolean
  editText: string
  onSelect: () => void
  onClearSelection: () => void
  onHoverEnter: () => void
  onHoverLeave: () => void
  onApprove: () => void
  onToggleResolve: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditTextChange: (s: string) => void
  onDelete: () => void
}

function pinPopoverStyle(c: Comment): CSSProperties {
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

export function CommentPin({
  comment: c,
  pinNumber,
  isSelected,
  isHovered,
  isEditing,
  editText,
  onSelect,
  onClearSelection,
  onHoverEnter,
  onHoverLeave,
  onApprove,
  onToggleResolve,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
  onDelete,
}: CommentPinProps) {
  const { pageX: pinPageX, pageY: pinPageY } = fromPagePercent(c.x, c.y)
  const isResolved = isResolvedStatus(c.reviewStatus)
  const avColor = avatarColor(c.id)
  const initial = getInitials(c.authorName) ?? (c.body[0] || 'U').toUpperCase()

  return (
    <div {...{ [WIDGET_ATTR]: '' }}>
      <div
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
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

      {isSelected && (
        <>
          <div
            onClick={onClearSelection}
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
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{c.authorName ?? 'User'}</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>
                  #{pinNumber} &middot; {timeAgo(c.createdAt)}
                </div>
              </div>
              <PinActionCluster
                key={c.id}
                isResolved={isResolved}
                onResolve={onApprove}
                onToggleResolve={onToggleResolve}
                onEdit={onStartEdit}
                onDelete={onDelete}
              />
            </div>

            {isEditing ? (
              <div style={{ marginBottom: c.imageUrl ? 10 : 14 }}>
                <textarea
                  autoFocus
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit() }
                    if (e.key === 'Escape') onCancelEdit()
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
                    onClick={onCancelEdit}
                    style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit' }}
                  >Cancel</button>
                  <button
                    onClick={onSaveEdit}
                    style={{ fontSize: 12, color: '#fff', background: '#3b82f6', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontFamily: 'inherit' }}
                  >Save</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#333', marginBottom: c.imageUrl ? 10 : 14 }}>
                {c.body}
              </div>
            )}

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
      )}
    </div>
  )
}
