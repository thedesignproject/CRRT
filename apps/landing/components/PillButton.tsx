import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { ISOLOGO } from '../lib/crrt'

type Variant = 'ghost' | 'carrot' | 'phosphor'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  withCarrot?: boolean
  children: ReactNode
}

export function PillButton({
  variant = 'ghost',
  size = 'md',
  withCarrot = true,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      className={`pill pill-${variant} pill-${size} ${className}`.trim()}
      {...rest}
    >
      {withCarrot && (
        <span className="carrot-chip">
          <img
            src={ISOLOGO}
            alt=""
            style={{ width: '100%', height: '100%', borderRadius: '50%', display: 'block' }}
          />
        </span>
      )}
      {children}
    </button>
  )
}
