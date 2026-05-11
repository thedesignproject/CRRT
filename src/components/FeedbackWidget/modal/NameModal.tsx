import { PIN_GRADIENT, WIDGET_ATTR } from '../constants'

export interface NameModalProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  existingName: string | null
}

export function NameModal({ value, onChange, onSubmit, onCancel, existingName }: NameModalProps) {
  const trimmed = value.trim()
  return (
    <div
      {...{ [WIDGET_ATTR]: '' }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        background: 'rgba(10, 10, 15, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fw-modal-overlay-in 0.18s ease both',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        style={{
          width: 360, maxWidth: 'calc(100vw - 32px)',
          background: '#fff', borderRadius: 16, padding: 24,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.25), 0 4px 12px rgba(0, 0, 0, 0.12)',
          animation: 'fw-modal-card-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
          display: 'flex', flexDirection: 'column', gap: 16,
          position: 'relative',
        }}
      >
        {existingName && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 28, height: 28, borderRadius: '50%',
              border: 'none', background: 'transparent',
              cursor: 'pointer', color: '#888',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#111' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div style={{
          width: 44, height: 44, borderRadius: '50% 50% 50% 0',
          background: PIN_GRADIENT,
          alignSelf: 'flex-start',
        }} />
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: 0, marginBottom: 6 }}>
            {existingName ? 'Change your name' : "What's your name?"}
          </h2>
          <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.4 }}>
            Your name will appear on the comments you leave.
          </p>
        </div>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Tomas"
          required
          maxLength={40}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px', fontSize: 14, color: '#111',
            background: '#fafafa',
            border: '1px solid #e5e5e5', borderRadius: 8,
            outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#fff' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = '#fafafa' }}
        />
        <button
          type="submit"
          disabled={!trimmed}
          style={{
            width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 600,
            color: '#fff',
            background: trimmed ? '#111' : '#ccc',
            border: 'none', borderRadius: 8,
            cursor: trimmed ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
            fontFamily: 'inherit',
          }}
        >
          {existingName ? 'Save' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
