import { cn } from '../lib/utils'
import type { StatusCounts } from '../lib/metrics'
import { DISPLAY_STATUS_LABELS, type DisplayStatus } from '../lib/types'

// Workflow order, so each status keeps its row and color regardless of counts.
const ORDER: DisplayStatus[] = ['open', 'ready', 'ready_for_testing', 'done', 'rejected']

const BAR: Record<DisplayStatus, string> = {
  open: 'bg-status-open',
  ready: 'bg-status-accepted',
  ready_for_testing: 'bg-status-ready-for-testing',
  done: 'bg-status-done',
  rejected: 'bg-status-rejected',
}

export function StatusBreakdown({ counts, title = 'Comments by status', onSelect }: {
  counts: StatusCounts
  title?: string
  onSelect?: (status: DisplayStatus) => void
}) {
  const total = ORDER.reduce((sum, s) => sum + counts[s], 0)
  const max = Math.max(1, ...ORDER.map((s) => counts[s]))
  return (
    <figure className="min-w-0 rounded-lg border border-border bg-card px-4 py-3">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-muted-foreground">{title}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{total.toLocaleString('en-US')} total</span>
      </figcaption>
      <ul className="flex flex-col gap-0.5">
        {ORDER.map((status) => {
          const count = counts[status]
          const label = DISPLAY_STATUS_LABELS[status]
          const row = (
            <>
              <span className="truncate text-xs text-foreground">{label}</span>
              <span className="h-2 min-w-0">
                {count > 0 && (
                  <span
                    className={cn('block h-full min-w-[2px] rounded-r', BAR[status])}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                )}
              </span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">{count.toLocaleString('en-US')}</span>
            </>
          )
          const grid = 'grid w-full grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 rounded-md px-1 py-1'
          return (
            <li key={status}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(status)}
                  aria-label={`${label}: ${count}`}
                  className={cn(grid, 'text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                >
                  {row}
                </button>
              ) : (
                <div className={grid}>{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
