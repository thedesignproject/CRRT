import { X } from 'lucide-react'
import { WIDGET_ATTR } from '../constants'

// Escape and C are keyboard-only, so touch screens get a visible way out of
// comment mode. The widget stylesheet places it below the safe-area inset and
// shows it only where a coarse pointer exists.
export function TouchExitButton({ onExit }: { onExit: () => void }) {
  return (
    <button
      type="button"
      {...{ [WIDGET_ATTR]: '' }}
      data-fw-touch-exit=""
      className="fw-touch-exit"
      aria-label="Exit comment mode"
      onClick={onExit}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        boxSizing: 'border-box',
        minWidth: 44,
        minHeight: 44,
        padding: '0 16px',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 9999,
        border: '1px solid var(--fw-contrast-12)',
        background: 'var(--fw-instruction-translucent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3)',
        color: 'var(--fw-foreground)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
    >
      <X size={16} strokeWidth={2.25} aria-hidden="true" />
      <span>Exit</span>
    </button>
  )
}
