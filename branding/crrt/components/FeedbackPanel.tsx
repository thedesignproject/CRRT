import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'
import { FeedbackBadge } from './FeedbackBadge'
import { DropCarrotButton } from './DropCarrotButton'
import { SeeFeedbackPanel, type FeedbackItem } from './SeeFeedbackPanel'

const containerVariants = cva('z-50', {
  variants: {
    position: {
      br: 'fixed bottom-[var(--crrt-space-7)] right-[var(--crrt-space-7)]',
      bl: 'fixed bottom-[var(--crrt-space-7)] left-[var(--crrt-space-7)]',
      tr: 'fixed top-[var(--crrt-space-7)] right-[var(--crrt-space-7)]',
      tl: 'fixed top-[var(--crrt-space-7)] left-[var(--crrt-space-7)]',
    },
  },
  defaultVariants: { position: 'br' },
})

export type { FeedbackItem }

export interface FeedbackPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof containerVariants> {
  count?: number
  items?: FeedbackItem[]
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerOn?: 'hover' | 'click'
  onDrop?: () => void
  onOpenFeedback?: () => void
  /** Override the canonical carrot asset path. */
  logoSrc?: string
  /** Theme override. `auto` follows [data-theme] on the document. */
  theme?: 'dark' | 'light' | 'auto'
  /** Distance from the page edge in px. Defaults to 24. */
  offset?: number
}

export const FeedbackPanel = React.forwardRef<HTMLDivElement, FeedbackPanelProps>(
  function FeedbackPanel(
    {
      className,
      position = 'br',
      count = 0,
      items = [],
      defaultOpen = false,
      open,
      onOpenChange,
      triggerOn = 'hover',
      onDrop,
      onOpenFeedback,
      logoSrc,
      theme = 'auto',
      offset,
      style,
      ...rest
    },
    ref,
  ) {
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
    const isControlled = typeof open === 'boolean'
    const isOpen = isControlled ? (open as boolean) : uncontrolled
    const containerRef = React.useRef<HTMLDivElement | null>(null)

    const setOpen = React.useCallback(
      (next: boolean) => {
        if (!isControlled) setUncontrolled(next)
        onOpenChange?.(next)
      },
      [isControlled, onOpenChange],
    )

    // Imperative ref merge
    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

    // Click-outside dismiss for click mode
    React.useEffect(() => {
      if (triggerOn !== 'click' || !isOpen) return
      const handler = (e: MouseEvent) => {
        if (!containerRef.current) return
        if (!containerRef.current.contains(e.target as Node)) setOpen(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [triggerOn, isOpen, setOpen])

    // Escape to close
    React.useEffect(() => {
      if (!isOpen) return
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false)
      }
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }, [isOpen, setOpen])

    const hoverProps =
      triggerOn === 'hover'
        ? {
            onMouseEnter: () => setOpen(true),
            onMouseLeave: () => setOpen(false),
            onFocus: () => setOpen(true),
            onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
            },
          }
        : {}

    const inlineStyle: React.CSSProperties = {
      ...(theme === 'dark' ? ({ ['data-theme' as string]: 'dark' } as React.CSSProperties) : {}),
      ...(offset !== undefined
        ? ({
            ['--crrt-space-7' as unknown as string]: `${offset}px`,
          } as React.CSSProperties)
        : {}),
      ...style,
    }

    return (
      <div
        ref={containerRef}
        data-theme={theme === 'auto' ? undefined : theme}
        className={cn(containerVariants({ position }), className)}
        style={inlineStyle}
        {...hoverProps}
        {...rest}
      >
        {/* Expanded options */}
        <div
          className={cn(
            'mb-[14px] flex flex-col items-end gap-[10px]',
            'transition-[opacity,transform] duration-[var(--crrt-duration-default)] ease-[var(--crrt-easing-emphasis)]',
            isOpen
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
          aria-hidden={!isOpen}
        >
          <DropCarrotButton
            logoSrc={logoSrc}
            onClick={() => {
              onDrop?.()
              if (triggerOn === 'click') setOpen(false)
            }}
          />
          <SeeFeedbackPanel
            count={count}
            items={items}
            onOpenChange={(o) => {
              if (o) onOpenFeedback?.()
            }}
          />
        </div>

        {/* Trigger */}
        <div className="flex justify-end">
          <FeedbackBadge
            position="inline"
            count={count}
            logoSrc={logoSrc}
            onClick={() => {
              if (triggerOn === 'click') setOpen(!isOpen)
            }}
            aria-expanded={isOpen}
            aria-haspopup="menu"
          />
        </div>
      </div>
    )
  },
)
