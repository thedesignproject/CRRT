import { NOISE_OVERLAY_BG, PIN_GRADIENT } from '../constants'

export function PinMarker({ outline = false }: { outline?: boolean }) {
  return (
    <div style={{
      width: 32, height: 32,
      borderRadius: '50% 50% 50% 0',
      background: PIN_GRADIENT,
      outline: outline ? '2px solid #fff' : 'none',
      outlineOffset: outline ? 1 : 0,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        left: '50%', top: '40%',
        width: 22, height: 22,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 65%)',
        animation: 'fw-pin-inner-pulse 1.8s ease-in-out infinite',
        pointerEvents: 'none',
        mixBlendMode: 'screen',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        backgroundImage: NOISE_OVERLAY_BG,
        mixBlendMode: 'overlay',
        opacity: 0.5,
        pointerEvents: 'none',
      }} />
    </div>
  )
}
