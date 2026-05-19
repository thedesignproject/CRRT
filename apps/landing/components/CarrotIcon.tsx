/**
 * Pixel-art carrot. Placeholder SVG — swap with the real Figma asset later.
 * Drawn on a 16×16 grid to keep `image-rendering: pixelated` crisp.
 */
export function CarrotIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    >
      {/* Green leaves */}
      <rect x="7" y="1" width="2" height="2" fill="#5ABF35" />
      <rect x="5" y="2" width="2" height="2" fill="#3E9020" />
      <rect x="9" y="2" width="2" height="2" fill="#5ABF35" />
      <rect x="6" y="3" width="4" height="1" fill="#5ABF35" />
      <rect x="10" y="3" width="1" height="1" fill="#3E9020" />

      {/* Carrot body (taper from wide top to point) */}
      <rect x="4" y="4" width="8" height="1" fill="#E8853D" />
      <rect x="11" y="4" width="1" height="1" fill="#B85F1F" />

      <rect x="4" y="5" width="8" height="1" fill="#E8853D" />
      <rect x="11" y="5" width="1" height="1" fill="#B85F1F" />

      <rect x="5" y="6" width="6" height="1" fill="#E8853D" />
      <rect x="10" y="6" width="1" height="1" fill="#B85F1F" />

      <rect x="5" y="7" width="6" height="1" fill="#E8853D" />
      <rect x="10" y="7" width="1" height="1" fill="#B85F1F" />

      <rect x="5" y="8" width="5" height="1" fill="#E8853D" />
      <rect x="9" y="8" width="1" height="1" fill="#B85F1F" />

      <rect x="6" y="9" width="4" height="1" fill="#E8853D" />
      <rect x="9" y="9" width="1" height="1" fill="#B85F1F" />

      <rect x="6" y="10" width="3" height="1" fill="#E8853D" />
      <rect x="8" y="10" width="1" height="1" fill="#B85F1F" />

      <rect x="7" y="11" width="2" height="1" fill="#E8853D" />
      <rect x="8" y="11" width="1" height="1" fill="#B85F1F" />

      <rect x="7" y="12" width="1" height="1" fill="#E8853D" />
      <rect x="8" y="12" width="1" height="1" fill="#B85F1F" />

      <rect x="7" y="13" width="1" height="1" fill="#B85F1F" />
    </svg>
  )
}
