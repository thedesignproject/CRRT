import { PIN_GRADIENT } from '../constants'

export function PinMarker({
  outline = false,
  number,
  resolved = false,
  hovered = false,
}: {
  outline?: boolean
  number?: number
  resolved?: boolean
  hovered?: boolean
}) {
  const expanded = hovered || outline
  const showHalo = !expanded && !resolved
  const animatedAtRest = !expanded && !resolved

  const background = resolved ? 'transparent' : PIN_GRADIENT

  const expandedShadow = [
    '0 0 0 1px rgba(255, 255, 255, 0.14)',
    '0 0 0 2.5px rgba(10, 10, 10, 0.55)',
    '0 0 12px rgba(232, 133, 61, 0.45)',
    '0 2px 6px rgba(10, 10, 10, 0.35)',
    'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
  ].join(', ')

  const resolvedShadow = '0 0 0 1.5px #6B6560, 0 1px 3px rgba(10, 10, 10, 0.2)'

  const boxShadow = resolved
    ? resolvedShadow
    : expanded
      ? expandedShadow
      : undefined  // animation keyframe owns box-shadow at rest

  const dotSize = expanded ? 22 : 12
  const numberColor = resolved ? '#6B6560' : '#FFFFFF'

  return (
    <div
      style={{
        position: 'relative',
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {showHalo && (
        <div
          data-fw-pin-halo
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'rgba(232, 133, 61, 0.6)',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            animation: 'crrt-pin-seed-halo 2400ms ease-out infinite',
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background,
          boxShadow,
          outline: outline ? '2px solid #fff' : 'none',
          outlineOffset: outline ? 2 : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700,
          fontSize: 11,
          lineHeight: 1,
          color: numberColor,
          textShadow: resolved || !expanded ? 'none' : '0 1px 1px rgba(10, 10, 10, 0.35)',
          animation: animatedAtRest ? 'crrt-pin-seed-bounce 2400ms ease-in-out infinite' : undefined,
          transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1), height 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), background 220ms ease',
        }}
      >
        {expanded && typeof number === 'number' && number > 0 ? number : ''}
      </div>
    </div>
  )
}
