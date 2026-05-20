import { CRRT_CARROT_LOGO_URL } from '@widget/components/FeedbackWidget/constants'

export function CarrotIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src={CRRT_CARROT_LOGO_URL}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'block',
        objectFit: 'cover',
        imageRendering: 'pixelated',
      }}
    />
  )
}
