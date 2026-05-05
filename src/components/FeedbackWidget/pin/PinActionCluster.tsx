import { useState } from 'react'

interface PinActionClusterProps {
  isResolved: boolean
  onResolve: () => void
  onToggleResolve: () => void
  onEdit: () => void
  onDelete: () => void
}

export function PinActionCluster({ isResolved, onResolve, onToggleResolve, onEdit, onDelete }: PinActionClusterProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, position: 'relative' }}>
      {!isResolved && (
        <button
          onClick={(e) => { e.stopPropagation(); onResolve() }}
          title="Approve"
          style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '1.5px solid #d4d4d4',
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', padding: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d4d4d4'; e.currentTarget.style.color = '#888' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        title="More"
        style={{
          width: 24, height: 24, borderRadius: 4, border: 'none',
          background: menuOpen ? '#f0f0f0' : 'transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#888', padding: 0,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = '#f5f5f5' }}
        onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
      </button>
      {!isResolved && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
      )}

      {menuOpen && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 30, right: 0, zIndex: 99999,
              background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
              padding: '4px 0', minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              animation: 'fw-tooltip-in 0.1s ease both',
            }}
          >
            <button
              onClick={() => { onToggleResolve(); setMenuOpen(false) }}
              style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#333', fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {isResolved ? 'Reopen' : 'Approve'}
            </button>
            <button
              onClick={() => { onEdit(); setMenuOpen(false) }}
              style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#333', fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
            <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
            <button
              onClick={() => { onDelete(); setMenuOpen(false) }}
              style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', color: '#ef4444', fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
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
