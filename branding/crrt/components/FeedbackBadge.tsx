import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const DEFAULT_LOGO_SRC = '/branding/design-system-crrt/Frame%2011.png'

const badgeVariants = cva(
  // Base
  cn(
    'relative inline-flex items-center justify-center',
    'border-0 bg-transparent p-0',
    'cursor-pointer select-none',
    'transition-transform duration-[var(--crrt-duration-default)] [transition-timing-function:var(--crrt-easing-emphasis)]',
    'hover:-rotate-3 hover:scale-[1.06] active:scale-[0.98]',
    'crrt-focus-ring rounded-full',
  ),
  {
    variants: {
      size: {
        sm: 'h-10 w-10',
        md: 'h-14 w-14',
        lg: 'h-[72px] w-[72px]',
      },
      position: {
        inline: '',
        br: 'fixed bottom-[var(--crrt-space-7)] right-[var(--crrt-space-7)] z-50',
        bl: 'fixed bottom-[var(--crrt-space-7)] left-[var(--crrt-space-7)] z-50',
        tr: 'fixed top-[var(--crrt-space-7)] right-[var(--crrt-space-7)] z-50',
        tl: 'fixed top-[var(--crrt-space-7)] left-[var(--crrt-space-7)] z-50',
      },
    },
    defaultVariants: {
      size: 'md',
      position: 'br',
    },
  },
)

export interface FeedbackBadgeProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof badgeVariants> {
  /** Unresolved feedback count. When > 0 the indicator dot pulses. */
  count?: number
  /** Force-show or hide the indicator dot. Defaults to `count > 0`. */
  showIndicator?: boolean
  /** Path to the canonical pixel-art carrot asset (PNG). */
  logoSrc?: string
  /** Alt text — also used as accessible name when `aria-label` is absent. */
  alt?: string
}

const dotSizeBySize: Record<NonNullable<FeedbackBadgeProps['size']>, string> = {
  sm: 'h-[7px] w-[7px]',
  md: 'h-[10px] w-[10px]',
  lg: 'h-[13px] w-[13px]',
}

export const FeedbackBadge = React.forwardRef<HTMLButtonElement, FeedbackBadgeProps>(
  function FeedbackBadge(
    {
      className,
      size = 'md',
      position = 'br',
      count,
      showIndicator,
      logoSrc = DEFAULT_LOGO_SRC,
      alt = 'Open CRRT.AI feedback',
      style,
      ...rest
    },
    ref,
  ) {
    const indicatorVisible = showIndicator ?? (typeof count === 'number' && count > 0)
    const dotSize = dotSizeBySize[size ?? 'md']

    return (
      <button
        ref={ref}
        type="button"
        aria-label={rest['aria-label'] ?? alt}
        className={cn(badgeVariants({ size, position }), className)}
        style={{
          filter: 'var(--crrt-shadow-trigger)',
          ...style,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'var(--crrt-shadow-trigger-hover)'
          rest.onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'var(--crrt-shadow-trigger)'
          rest.onMouseLeave?.(e)
        }}
        {...rest}
      >
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          draggable={false}
          className="crrt-pixelated h-full w-full rounded-full"
        />
        {indicatorVisible && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute right-[2px] top-[2px] rounded-full',
              dotSize,
            )}
            style={{
              background: 'var(--crrt-carrot)',
              boxShadow: '0 0 0 2px var(--background)',
              animation:
                'crrt-pulse var(--crrt-pulse-duration) var(--crrt-easing-default) infinite',
            }}
          />
        )}
        {typeof count === 'number' && count > 0 && (
          <span className="sr-only">{count} unresolved feedback items</span>
        )}
      </button>
    )
  },
)
