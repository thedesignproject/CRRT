import { WIDGET_ATTR } from '../constants'

export interface SelectingInstructionBarProps {
  onCancel: () => void
}

export function SelectingInstructionBar({ onCancel }: SelectingInstructionBarProps) {
  return (
    <div
      {...{ [WIDGET_ATTR]: '' }}
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderRadius: 9999,
        background: '#fff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 13,
        color: '#111',
        whiteSpace: 'nowrap',
        animation: 'fw-instruction-in 0.3s ease both',
      }}
    >
      <span className="fw-rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E5502A', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>Click any element to leave feedback</span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        border: '1px solid #d1d5db',
        fontSize: 12,
        fontWeight: 600,
        color: '#888',
        lineHeight: 1.4,
      }}>Esc</span>
      <span
        onClick={onCancel}
        style={{
          color: '#999',
          fontSize: 12,
          cursor: 'pointer',
          marginLeft: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#111')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
      >exit</span>
    </div>
  )
}
