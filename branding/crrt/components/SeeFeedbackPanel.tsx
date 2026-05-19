import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

export type FeedbackItem = {
  id: string
  body: string
  createdAt: string
  status?: 'open' | 'resolved'
  author?: string
  pageUrl?: string
}

const pillVariants = cva(
  cn(
    'inline-flex items-center gap-3 whitespace-nowrap',
    'select-none cursor-pointer',
    'font-[var(--crrt-font-sans)] font-medium',
    'bg-[var(--crrt-bg-deep)] text-[var(--crrt-white)]',
    'border border-[var(--crrt-rule-dark)]',
    'transition-[transform,background-color] duration-[var(--crrt-duration-fast)] ease-[var(--crrt-easing-default)]',
    'hover:bg-[var(--crrt-bg-deep-soft)] hover:-translate-x-[2px]',
    'active:scale-[0.98]',
    'crrt-focus-ring',
  ),
  {
    variants: {
      size: {
        sm: 'h-8 rounded-full pl-[6px] pr-[14px] text-[12px]',
        md: 'h-11 rounded-full pl-[8px] pr-[18px] text-[13px]',
        lg: 'h-[52px] rounded-full pl-[10px] pr-[22px] text-[14px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

const panelSurfaceVariants = cva(
  cn(
    'mt-2 overflow-hidden rounded-[var(--crrt-radius-2xl)]',
    'bg-[var(--crrt-bg-deep-soft)] text-[var(--crrt-white)]',
    'border border-[var(--crrt-rule-dark)]',
    'shadow-[var(--crrt-shadow-md)]',
  ),
  {
    variants: {
      align: {
        start: 'self-start',
        end: 'self-end',
      },
    },
    defaultVariants: { align: 'end' },
  },
)

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      aria-hidden
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="3" width="8" height="1.2" />
      <rect x="2" y="5.4" width="8" height="1.2" />
      <rect x="2" y="7.8" width="8" height="1.2" />
    </svg>
  )
}

export interface SeeFeedbackPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof pillVariants> {
  count: number
  items?: FeedbackItem[]
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  emptyLabel?: string
  renderItem?: (item: FeedbackItem) => React.ReactNode
  align?: 'start' | 'end'
  label?: string
  /** Maximum panel height in px. Defaults to 480. */
  maxHeight?: number
}

function defaultRenderItem(item: FeedbackItem) {
  const date = new Date(item.createdAt)
  const isValid = !Number.isNaN(date.getTime())
  const stamp = isValid
    ? date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : item.createdAt

  return (
    <li
      key={item.id}
      className={cn(
        'flex flex-col gap-[6px] px-[14px] py-[14px]',
        'border-b border-[var(--crrt-rule-dark)] last:border-b-0',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] leading-snug text-[var(--crrt-white)]">
          {item.body}
        </span>
        <span
          className="crrt-font-crt text-[14px] text-[var(--crrt-ink-faint)] shrink-0"
          aria-label="created at"
        >
          {stamp}
        </span>
      </div>
      {(item.author || item.status) && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--crrt-ink-faint)]">
          {item.author && <span>{item.author}</span>}
          {item.author && item.status && <span aria-hidden>·</span>}
          {item.status && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-[1px] text-[11px]',
                item.status === 'resolved'
                  ? 'bg-[var(--crrt-rule-dark)] text-[var(--crrt-ink-faint)]'
                  : 'bg-[var(--crrt-carrot)]/15 text-[var(--crrt-carrot)]',
              )}
            >
              {item.status}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

export const SeeFeedbackPanel = React.forwardRef<HTMLDivElement, SeeFeedbackPanelProps>(
  function SeeFeedbackPanel(
    {
      className,
      size = 'md',
      align = 'end',
      count,
      items = [],
      open,
      defaultOpen = false,
      onOpenChange,
      emptyLabel = 'No feedback yet.',
      renderItem = defaultRenderItem,
      label = 'See feedback',
      maxHeight = 480,
      ...rest
    },
    ref,
  ) {
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
    const isControlled = typeof open === 'boolean'
    const isOpen = isControlled ? (open as boolean) : uncontrolled

    const setOpen = React.useCallback(
      (next: boolean) => {
        if (!isControlled) setUncontrolled(next)
        onOpenChange?.(next)
      },
      [isControlled, onOpenChange],
    )

    const panelId = React.useId()

    return (
      <div
        ref={ref}
        className={cn('flex flex-col', align === 'end' ? 'items-end' : 'items-start', className)}
        {...rest}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setOpen(!isOpen)}
          className={cn(pillVariants({ size }))}
          style={{ boxShadow: 'var(--crrt-shadow-pill)' }}
        >
          <span
            aria-hidden
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full',
              'bg-[var(--crrt-rule-dark-strong)] text-[var(--crrt-white)]',
              size === 'sm' && 'h-6 w-6',
              size === 'md' && 'h-7 w-7',
              size === 'lg' && 'h-9 w-9',
            )}
          >
            <ListIcon className="h-3 w-3" />
          </span>
          <span>{label}</span>
          <span
            className="crrt-font-crt text-[14px] text-[var(--crrt-ink-faint)]"
            aria-label={`${count} items`}
          >
            {count.toString().padStart(2, '0')}
          </span>
        </button>

        {isOpen && (
          <div
            id={panelId}
            role="region"
            aria-label="Feedback list"
            className={cn(panelSurfaceVariants({ align }), 'w-[min(360px,90vw)]')}
            style={{ maxHeight, overflowY: 'auto' }}
          >
            {items.length === 0 ? (
              <div className="px-[14px] py-[20px] text-center text-[13px] text-[var(--crrt-ink-faint)]">
                {emptyLabel}
              </div>
            ) : (
              <ul className="m-0 list-none p-0">{items.map((item) => renderItem(item))}</ul>
            )}
          </div>
        )}
      </div>
    )
  },
)
