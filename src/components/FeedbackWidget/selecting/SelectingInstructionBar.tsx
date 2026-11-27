import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { WIDGET_ATTR } from '../constants'

const instructionStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 2147483647,
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  borderRadius: 9999,
  background: 'var(--fw-instruction-translucent)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--fw-contrast-08)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3)',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 13,
  color: 'var(--fw-foreground)',
  whiteSpace: 'nowrap',
  animation: 'fw-instruction-in 0.3s ease both',
}

export function TouchSelectionExit({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      {...{ [WIDGET_ATTR]: '' }}
      type="button"
      className="fw-touch-selection-exit"
      aria-label="Exit comment mode"
      onClick={onCancel}
      style={{
        ...instructionStyle,
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <X size={16} aria-hidden="true" />
      Exit
    </button>
  )
}

export interface SelectingInstructionBarProps {
  onCancel: () => void
  message?: string
  keyLabel?: string
  actionLabel?: string
  tone?: 'default' | 'success'
}

export function SelectingInstructionBar({
  onCancel,
  message = 'Click an element or select text to leave feedback',
  keyLabel = 'Esc',
  actionLabel = 'exit',
  tone = 'default',
}: SelectingInstructionBarProps) {
  const dotColor = tone === 'success' ? '#E8853D' : '#E5502A'

  return (
    <div
      {...{ [WIDGET_ATTR]: '' }}
      style={{
        ...instructionStyle,
        bottom: 24,
        display: 'flex',
        maxWidth: 'calc(100vw - 32px)',
        overflow: 'hidden',
      }}
    >
      <span
        className="fw-rec-dot"
        style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
      />
      <span style={{ fontWeight: 500, color: 'var(--fw-foreground-soft)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{message}</span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        borderRadius: 4,
        border: '1px solid var(--fw-contrast-12)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--fw-foreground-faint)',
        lineHeight: 1.4,
        fontFamily: "'JetBrains Mono', monospace",
      }}>{keyLabel}</span>
      <button
        type="button"
        className="fw-selecting-instruction-action"
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--fw-foreground-faint)',
          fontSize: 12,
          cursor: 'pointer',
          marginLeft: 2,
          padding: '2px 6px',
          borderRadius: 4,
          fontFamily: 'inherit',
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--fw-foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fw-foreground-faint)')}
      >{actionLabel}</button>
    </div>
  )
}
