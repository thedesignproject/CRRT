import { Check } from 'lucide-react'

export type FilterValue = 'all' | 'open' | 'approved'

interface FilterPopoverProps {
  filterStatus: FilterValue
  onChange: (next: FilterValue) => void
  onClose: () => void
}

export function FilterPopover({ filterStatus, onChange, onClose }: FilterPopoverProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          right: 38,
          marginTop: 4,
          zIndex: 100001,
          background: '#222',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 4,
          minWidth: 180,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'fw-slide-in 0.15s ease both',
        }}
      >
        {(['all', 'open', 'approved'] as const).map((f) => {
          const active = filterStatus === f
          const label = f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Approved'
          return (
            <button
              key={f}
              onClick={() => { onChange(f); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: '#ddd',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2e2e2e')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {active && <Check style={{ width: 14, height: 14, color: '#0ea5e9' }} />}
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </>
  )
}
