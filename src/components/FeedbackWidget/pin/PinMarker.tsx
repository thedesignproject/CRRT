/**
 * CRRT pin — simple Carrot dot circle with a number.
 * 22×22 footprint (smaller than the original 32 so it's less invasive on content).
 */
export function PinMarker({
  outline = false,
  number,
  resolved = false,
}: {
  outline?: boolean
  number?: number
  resolved?: boolean
}) {
  const fill = resolved ? 'transparent' : '#E8853D'
  const ringColor = resolved ? '#6B6560' : '#0A0A0A'
  const numberColor = resolved ? '#6B6560' : '#FFFFFF'

  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: fill,
        boxShadow: `0 0 0 2px ${ringColor}, 0 2px 6px rgba(10, 10, 10, 0.35)`,
        outline: outline ? '2px solid #fff' : 'none',
        outlineOffset: outline ? 1 : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        color: numberColor,
        userSelect: 'none',
        transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {typeof number === 'number' && number > 0 ? number : ''}
    </div>
  )
}
