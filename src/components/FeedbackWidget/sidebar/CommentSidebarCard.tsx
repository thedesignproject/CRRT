import { getInitials, timeAgo } from '../format'
import type { Comment } from '../types'

interface CommentSidebarCardProps {
  comment: Comment
  pinNumber: number
  index: number
  sidebarOpen: boolean
  isMenuOpen: boolean
  isEditing: boolean
  editText: string
  onCardClick: () => void
  onCardEditEnter: () => void
  onEditTextChange: (s: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onApprove: () => void
  onMenuToggle: () => void
  onMenuClose: () => void
  onToggleResolve: () => void
  onMenuEditEnter: () => void
  onDelete: () => void
}

export function CommentSidebarCard({
  comment: c,
  pinNumber: pinNum,
  index: i,
  sidebarOpen,
  isMenuOpen,
  isEditing,
  editText,
  onCardClick,
  onCardEditEnter,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onApprove,
  onMenuToggle,
  onMenuClose,
  onToggleResolve,
  onMenuEditEnter,
  onDelete,
}: CommentSidebarCardProps) {
  const isResolved = c.reviewStatus === 'accepted' || c.reviewStatus === 'rejected'
  const isPending = !c.reviewStatus || c.reviewStatus === 'open'
  const initial = getInitials(c.authorName) ?? (c.body[0] || 'U').toUpperCase()
  return (
    <div
      className="fw-sidebar-card"
      onClick={() => { if (!isEditing && !isMenuOpen) onCardClick() }}
      style={{
        padding: '12px 16px',
        cursor: isEditing ? 'default' : 'pointer',
        position: 'relative',
        zIndex: isMenuOpen ? 100000 : 'auto',
        display: 'flex',
        gap: 10,
        borderBottom: '1px solid #2a2a2a',
        opacity: isResolved ? 0.5 : 1,
        transition: 'background 0.1s, opacity 0.2s',
        animation: sidebarOpen ? `fw-slide-in 0.2s ease ${i * 0.04}s both` : 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#222' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: isResolved ? '#333' : '#3b82f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 12, fontWeight: 700,
      }}>
        {initial}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: '#888' }}>#{pinNum}</span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 4h4M4.5 2L6.5 4L4.5 6" stroke="#555" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.pageUrl.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>{c.authorName ?? 'User'}</span>
          <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(c.createdAt)}</span>
        </div>

        {isEditing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSaveEdit() }
                if (e.key === 'Escape') onCancelEdit()
              }}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 13, lineHeight: 1.4, color: '#fff',
                border: '1px solid #444', borderRadius: 5,
                padding: '6px 8px', fontFamily: 'inherit',
                outline: 'none', resize: 'none', background: '#2a2a2a',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
              onBlur={(e) => (e.target.style.borderColor = '#444')}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
              <button onClick={onCancelEdit} style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Cancel</button>
              <button onClick={onSaveEdit} style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <div
              onClick={(e) => { e.stopPropagation(); onCardEditEnter() }}
              style={{ fontSize: 13, lineHeight: 1.4, color: isResolved ? '#555' : '#ccc', cursor: 'text' }}
            >
              {c.body}
            </div>
            {c.imageUrl && (
              <img
                src={c.imageUrl}
                alt=""
                onClick={(e) => { e.stopPropagation(); window.open(c.imageUrl!, '_blank') }}
                style={{ marginTop: 8, maxWidth: '100%', borderRadius: 6, border: '1px solid #2a2a2a', cursor: 'zoom-in', display: 'block', filter: isResolved ? 'grayscale(0.7) brightness(0.5)' : 'none' }}
              />
            )}
          </>
        )}
      </div>

      <div style={{
        position: 'absolute', top: 10, right: 12,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div className="fw-card-actions" style={{
          display: 'none', alignItems: 'center', gap: 2,
        }}>
          {isPending && (
            <button
              onClick={(e) => { e.stopPropagation(); onApprove() }}
              title="Approve"
              style={{
                width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #555',
                background: 'transparent', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#888', padding: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#888' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
            title="More"
            style={{
              width: 24, height: 24, borderRadius: 4, border: 'none',
              background: isMenuOpen ? '#333' : 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#888', padding: 0,
            }}
            onMouseEnter={(e) => { if (!isMenuOpen) e.currentTarget.style.background = '#333' }}
            onMouseLeave={(e) => { if (!isMenuOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
        </div>
        {isPending && !isEditing && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
        )}
      </div>

      {isMenuOpen && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); onMenuClose() }}
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
              onClick={() => { onToggleResolve(); onMenuClose() }}
              style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ccc', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {c.reviewStatus === 'accepted' ? 'Reopen' : 'Approve'}
            </button>
            <button
              onClick={() => { onMenuEditEnter(); onMenuClose() }}
              style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ccc', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
            <div style={{ height: 1, background: '#3a3a3a', margin: '4px 0' }} />
            <button
              onClick={() => { onDelete(); onMenuClose() }}
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
}

