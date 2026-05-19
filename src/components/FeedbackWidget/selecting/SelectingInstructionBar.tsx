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
        background: 'rgba(10, 10, 10, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 13,
        color: '#FFFFFF',
        whiteSpace: 'nowrap',
        animation: 'fw-instruction-in 0.3s ease both',
      }}
    >
      <span
        className="fw-rec-dot"
        style={{ width: 7, height: 7, borderRadius: '50%', background: '#E5502A', flexShrink: 0 }}
      />
      <span style={{ fontWeight: 500, color: '#E8E5DF' }}>Click any element to leave feedback</span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        borderRadius: 4,
        border: '1px solid rgba(255, 255, 255, 0.12)',
        fontSize: 11,
        fontWeight: 600,
        color: '#6B6560',
        lineHeight: 1.4,
        fontFamily: "'JetBrains Mono', monospace",
      }}>Esc</span>
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#6B6560',
          fontSize: 12,
          cursor: 'pointer',
          marginLeft: 2,
          padding: '2px 6px',
          borderRadius: 4,
          fontFamily: 'inherit',
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6560')}
      >exit</button>
    </div>
  )
}
