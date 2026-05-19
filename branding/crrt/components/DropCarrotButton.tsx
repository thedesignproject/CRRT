import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const DEFAULT_LOGO_SRC = '/branding/design-system-crrt/Frame%2011.png'

const buttonVariants = cva(
  cn(
    'group/dcb inline-flex items-center gap-3 whitespace-nowrap',
    'select-none cursor-pointer',
    'font-[var(--crrt-font-sans)] font-medium',
    'transition-[transform,background-color,box-shadow,opacity]',
    'duration-[var(--crrt-duration-fast)] ease-[var(--crrt-easing-default)]',
    'active:scale-[0.98]',
    'crrt-focus-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ),
  {
    variants: {
      tone: {
        dark: cn(
          'bg-[var(--crrt-bg-deep)] text-[var(--crrt-white)]',
          'border border-[var(--crrt-rule-dark)]',
          'hover:bg-[var(--crrt-bg-deep-soft)] hover:-translate-x-[2px]',
        ),
        carrot: cn(
          'bg-[var(--crrt-carrot)] text-[var(--crrt-white)]',
          'border border-[var(--crrt-carrot-deep)]',
          'hover:bg-[var(--crrt-carrot-deep)]',
        ),
        phosphor: cn(
          'bg-[var(--crrt-phosphor)] text-[var(--crrt-ink)]',
          'border border-[var(--crrt-phosphor)]',
          'hover:brightness-95',
        ),
      },
      size: {
        sm: 'h-8 rounded-full pl-[6px] pr-[14px] text-[12px]',
        md: 'h-11 rounded-full pl-[8px] pr-[18px] text-[13px]',
        lg: 'h-[52px] rounded-full pl-[10px] pr-[22px] text-[14px]',
      },
    },
    defaultVariants: {
      tone: 'dark',
      size: 'md',
    },
  },
)

const iconSizeBySize: Record<NonNullable<VariantProps<typeof buttonVariants>['size']>, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
  lg: 'h-9 w-9',
}

export interface DropCarrotButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof buttonVariants> {
  /** Button label. Defaults to "Drop a carrot". */
  children?: React.ReactNode
  /** Icon position. `none` hides the carrot leading icon. */
  iconPosition?: 'leading' | 'trailing' | 'none'
  /** Show a spinner in place of the icon. */
  loading?: boolean
  /** Override the canonical carrot asset path. */
  logoSrc?: string
}

export const DropCarrotButton = React.forwardRef<HTMLButtonElement, DropCarrotButtonProps>(
  function DropCarrotButton(
    {
      className,
      tone = 'dark',
      size = 'md',
      iconPosition = 'leading',
      loading = false,
      logoSrc = DEFAULT_LOGO_SRC,
      children = 'Drop a carrot',
      style,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const iconClass = iconSizeBySize[size ?? 'md']

    const icon =
      iconPosition === 'none' ? null : loading ? (
        <span
          aria-hidden
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full',
            iconClass,
          )}
          style={{
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'crrt-spin 0.8s linear infinite',
          }}
        />
      ) : (
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          draggable={false}
          className={cn('crrt-pixelated shrink-0 rounded-full', iconClass)}
        />
      )

    return (
      <button
        ref={ref}
        type={type}
        aria-busy={loading || undefined}
        className={cn(
          buttonVariants({ tone, size }),
          // Trailing-icon: swap padding so the asset sits on the right
          iconPosition === 'trailing' && {
            sm: 'pl-[14px] pr-[6px]',
            md: 'pl-[18px] pr-[8px]',
            lg: 'pl-[22px] pr-[10px]',
          }[size ?? 'md'],
          className,
        )}
        style={{
          boxShadow: 'var(--crrt-shadow-pill)',
          ...style,
        }}
        {...rest}
      >
        {iconPosition === 'leading' && icon}
        <span>{children}</span>
        {iconPosition === 'trailing' && icon}
      </button>
    )
  },
)
