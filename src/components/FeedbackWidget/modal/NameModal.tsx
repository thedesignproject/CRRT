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
        background: 'rgba(10, 10, 15, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fw-modal-overlay-in 0.18s ease both',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        style={{
          width: 360, maxWidth: 'calc(100vw - 32px)',
          background: '#181818',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16, padding: 24,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
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
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
              cursor: 'pointer', color: '#6B6560',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 150ms ease, color 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B6560' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div style={{
          width: 40, height: 40, borderRadius: '50% 50% 50% 0',
          background: PIN_GRADIENT,
          alignSelf: 'flex-start', flexShrink: 0,
        }} />
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: 0, marginBottom: 6 }}>
            {existingName ? 'Change your name' : "What's your name?"}
          </h2>
          <p style={{ fontSize: 13, color: '#A8A29A', margin: 0, lineHeight: 1.5 }}>
            Your name will appear on the comments you leave.
          </p>
        </div>
        <div>
          <label htmlFor="fw-crrt-name-input" style={{ display: 'none' }}>Your name</label>
          <input
            id="fw-crrt-name-input"
            autoFocus
            type="text"
            name="displayName"
            autoComplete="name"
            aria-label="Your name"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. Tomas"
            required
            maxLength={40}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', fontSize: 14, color: '#FFFFFF',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8,
              outline: 'none', fontFamily: 'inherit',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#E8853D'; e.currentTarget.style.background = 'rgba(232, 133, 61, 0.06)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          />
        </div>
        <button
          type="submit"
          disabled={!trimmed}
          style={{
            width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 600,
            color: trimmed ? '#FFFFFF' : '#6B6560',
            background: trimmed ? '#E8853D' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${trimmed ? '#B85F1F' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            cursor: trimmed ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            fontFamily: 'inherit',
            boxShadow: trimmed ? '0 4px 12px rgba(232, 133, 61, 0.28)' : 'none',
          }}
          /* v8 ignore next 2 */
          onMouseEnter={(e) => { if (trimmed) e.currentTarget.style.background = '#B85F1F' }}
          onMouseLeave={(e) => { if (trimmed) e.currentTarget.style.background = '#E8853D' }}
        >
          {existingName ? 'Save' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
