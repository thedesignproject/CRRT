import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { CarrotIcon } from './CarrotIcon'

type Variant = 'ghost' | 'carrot' | 'phosphor'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  withCarrot?: boolean
  children: ReactNode
}

/**
 * Drop-a-carrot pill. Three variants and three sizes mirroring Figma "/ 04 tone".
 */
export function PillButton({
  variant = 'ghost',
  size = 'md',
  withCarrot = true,
  children,
  className = '',
  ...rest
}: Props) {
  const iconSize = size === 'sm' ? 20 : size === 'lg' ? 30 : 24
  return (
    <button
      className={`pill pill-${variant} pill-${size} ${className}`.trim()}
      {...rest}
    >
      {withCarrot && (
        <span className="carrot-chip">
          <CarrotIcon size={iconSize} />
        </span>
      )}
      <span>{children}</span>
    </button>
  )
}
