import { CarrotIcon } from './CarrotIcon'

function IconShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: 'var(--crrt-bg-deep)',
        border: '1px solid var(--crrt-rule-dark)',
        boxShadow: '0 6px 14px rgba(10, 10, 10, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}

export function TerminalIcon() {
  return (
    <IconShell>
      <span
        style={{
          fontFamily: 'var(--crrt-font-crt)',
          fontSize: 32,
          fontWeight: 400,
          color: 'var(--crrt-white)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
        }}
      >
        <span>&gt;</span>
        <span style={{ color: 'var(--crrt-phosphor)' }}>_</span>
      </span>
    </IconShell>
  )
}

export function WidgetCarrotIcon() {
  return (
    <IconShell>
      {/* crrt-scroll-rotate ties rotation to scroll position — see useScrollProgress */}
      <span className="crrt-scroll-rotate" style={{ display: 'inline-flex' }}>
        <CarrotIcon size={34} />
      </span>
    </IconShell>
  )
}

export function AgentIcon() {
  const fill = 'var(--crrt-phosphor)'
  const cutout = 'var(--crrt-bg-deep)'  // matches the shell so eyes/mouth read as "holes"
  return (
    <IconShell>
      <svg
        width="34"
        height="34"
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        style={{ imageRendering: 'pixelated', display: 'block' }}
        aria-hidden="true"
      >
        {/* Antenna stem + tip */}
        <rect x="7" y="1" width="2" height="2" fill={fill} />
        <rect x="7" y="3" width="2" height="1" fill={fill} />
        {/* Head body */}
        <rect x="3" y="4" width="10" height="8" fill={fill} />
        {/* Eyes (holes) */}
        <rect x="5" y="7" width="2" height="2" fill={cutout} />
        <rect x="9" y="7" width="2" height="2" fill={cutout} />
        {/* Smile */}
        <rect x="6" y="10" width="4" height="1" fill={cutout} />
        {/* Neck */}
        <rect x="6" y="12" width="4" height="1" fill={fill} />
        {/* Base / collar */}
        <rect x="4" y="13" width="8" height="1" fill={fill} />
      </svg>
    </IconShell>
  )
}
