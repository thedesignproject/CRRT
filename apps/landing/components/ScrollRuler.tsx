/**
 * Phosphor amber vertical ruler — fixed to the right edge of the viewport,
 * tracks scroll position. A 1px line spans the height of the viewport, a
 * filled segment grows from the top down with scroll progress, and a small
 * carrot dot rides the leading edge.
 *
 * Hidden under 1024px so it doesn't crowd mobile/tablet.
 */
export function ScrollRuler() {
  return (
    <div
      aria-hidden
      className="crrt-scroll-ruler"
      style={{
        position: 'fixed',
        top: 0,
        left: 24,             // left margin → bottom-right stays clear for the widget pill
        bottom: 0,
        width: 16,
        zIndex: 30,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      {/* Background track */}
      <div
        style={{
          position: 'absolute',
          top: 96,
          bottom: 96,
          left: '50%',
          marginLeft: -1,
          width: 1,
          background: 'rgba(255, 176, 0, 0.08)',
        }}
      />
      {/* Filled portion — grows with scroll */}
      <div
        style={{
          position: 'absolute',
          top: 96,
          left: '50%',
          marginLeft: -1,
          width: 1,
          height: 'calc((100vh - 192px) * var(--scroll-progress, 0))',
          background: 'linear-gradient(to bottom, rgba(255, 176, 0, 0), rgba(255, 176, 0, 0.55))',
        }}
      />
      {/* Leading dot */}
      <div
        style={{
          position: 'absolute',
          top: `calc(96px + (100vh - 192px) * var(--scroll-progress, 0))`,
          left: '50%',
          width: 8,
          height: 8,
          marginLeft: -4,
          marginTop: -4,
          borderRadius: '50%',
          background: 'var(--crrt-phosphor)',
          boxShadow: '0 0 12px rgba(255, 176, 0, 0.6)',
          transition: 'top 80ms linear',
        }}
      />
      {/* Numeric readout — anchored to the top so it doesn't collide with the
          widget pill at bottom-right. Vertical-lr reads top-to-bottom on the
          left margin. */}
      <div
        style={{
          position: 'absolute',
          top: 32,
          fontFamily: 'var(--crrt-font-crt)',
          fontSize: 11,
          color: 'var(--crrt-phosphor)',
          letterSpacing: '0.1em',
          opacity: 0.7,
          writingMode: 'vertical-lr',
          textOrientation: 'mixed',
        }}
      >
        SCRL · <span style={{ color: 'var(--crrt-phosphor)' }}>SYNC</span>
      </div>
    </div>
  )
}
