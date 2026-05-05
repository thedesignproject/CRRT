import { SlidersHorizontal } from 'lucide-react'
import { WIDGET_ATTR } from '../constants'
import type { Comment, ReviewStatus } from '../types'
import { FilterPopover, type FilterValue } from './FilterPopover'
import { CommentSidebarCard } from './CommentSidebarCard'

interface CommentSidebarProps {
  open: boolean
  onClose: () => void
  visibleComments: Comment[]
  filteredComments: Comment[]
  sortedComments: Comment[]
  commentCount: number
  filterStatus: FilterValue
  setFilterStatus: (s: FilterValue) => void
  headerPopover: 'filter' | null
  setHeaderPopover: (v: 'filter' | null) => void
  editingId: string | null
  setEditingId: (id: string | null) => void
  editText: string
  setEditText: (s: string) => void
  menuOpenId: string | null
  setMenuOpenId: (id: string | null) => void
  onCardClick: (commentId: string, selector: string) => void
  onApprove: (id: string) => void
  onToggleResolve: (id: string, current: ReviewStatus) => void
  onSaveEdit: (id: string) => void
  onDelete: (id: string) => void
  onEnterFeedback: () => void
}

export function CommentSidebar({
  open,
  onClose,
  visibleComments,
  filteredComments,
  sortedComments,
  commentCount,
  filterStatus,
  setFilterStatus,
  headerPopover,
  setHeaderPopover,
  editingId,
  setEditingId,
  editText,
  setEditText,
  menuOpenId,
  setMenuOpenId,
  onCardClick,
  onApprove,
  onToggleResolve,
  onSaveEdit,
  onDelete,
  onEnterFeedback,
}: CommentSidebarProps) {
  return (
    <>
      {open && (
        <div
          {...{ [WIDGET_ATTR]: '' }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483646 }}
        />
      )}

      <div
        {...{ [WIDGET_ATTR]: '' }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 340,
          zIndex: 2147483647,
          background: '#1a1a1a',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.3)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #2a2a2a', position: 'relative' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>Comments</span>
          <span style={{ fontSize: 12, color: '#888', marginRight: 10 }}>{commentCount}</span>

          <button
            onClick={(e) => { e.stopPropagation(); setHeaderPopover(headerPopover === 'filter' ? null : 'filter') }}
            title="Filter"
            style={{
              background: headerPopover === 'filter' ? '#2a2a2a' : 'none',
              border: 'none',
              color: filterStatus !== 'all' ? '#0ea5e9' : '#bbb',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              marginRight: 2,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { if (headerPopover !== 'filter' && filterStatus === 'all') e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { if (headerPopover !== 'filter' && filterStatus === 'all') e.currentTarget.style.color = '#bbb' }}
          >
            <SlidersHorizontal style={{ width: 14, height: 14 }} />
          </button>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', transition: 'color 0.15s, background 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = '#2a2a2a' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {headerPopover === 'filter' && (
            <FilterPopover
              filterStatus={filterStatus}
              onChange={setFilterStatus}
              onClose={() => setHeaderPopover(null)}
            />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {sortedComments.length === 0 && (
            <div style={{ color: '#555', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              {visibleComments.length === 0 ? 'No comments yet' : 'No comments match this filter'}
            </div>
          )}
          {sortedComments.map((c, i) => {
            const pinNum = filteredComments.length - filteredComments.indexOf(c)
            const isMenuOpen = menuOpenId === c.id
            const isEditing = editingId === c.id
            return (
              <CommentSidebarCard
                key={c.id}
                comment={c}
                pinNumber={pinNum}
                index={i}
                sidebarOpen={open}
                isMenuOpen={isMenuOpen}
                isEditing={isEditing}
                editText={editText}
                onCardClick={() => onCardClick(c.id, c.selector)}
                onCardEditEnter={() => { setEditingId(c.id); setEditText(c.body) }}
                onEditTextChange={setEditText}
                onSaveEdit={() => onSaveEdit(c.id)}
                onCancelEdit={() => setEditingId(null)}
                onApprove={() => onApprove(c.id)}
                onMenuToggle={() => setMenuOpenId(isMenuOpen ? null : c.id)}
                onMenuClose={() => setMenuOpenId(null)}
                onToggleResolve={() => onToggleResolve(c.id, c.reviewStatus)}
                onMenuEditEnter={() => { setEditingId(c.id); setEditText(c.body) }}
                onDelete={() => onDelete(c.id)}
              />
            )
          })}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a2a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => { onEnterFeedback(); onClose() }}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500,
              color: '#888', background: 'transparent', border: 'none', borderRadius: 6,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            + Leave feedback
          </button>
        </div>
      </div>
    </>
  )
}
