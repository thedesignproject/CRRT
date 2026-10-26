import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DailyPoint } from '../lib/metrics'

const WIDTH = 320
const HEIGHT = 96
const PAD = 4

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function LineChart({ title, points, summary = 'total' }: {
  title: string
  points: DailyPoint[]
  summary?: 'total' | 'latest'
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...points.map((p) => p.value))
  const total = points.reduce((sum, p) => sum + p.value, 0)
  // Snapshot series (e.g. a backlog) can't be summed, so they report the latest day instead.
  const headline = summary === 'latest' ? `${(points[points.length - 1]?.value ?? 0).toLocaleString('en-US')} latest` : `${total.toLocaleString('en-US')} total`
  const x = (i: number) => points.length === 1 ? WIDTH / 2 : PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2)
  const y = (v: number) => HEIGHT - PAD - (v / max) * (HEIGHT - PAD * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const ratio = (event.clientX - rect.left) / rect.width
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))))
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : points.length)) + step)))
  }

  // A lone point draws no line, so keep its marker visible.
  const marked = active ?? (points.length === 1 ? 0 : null)
  const point = marked === null ? null : points[marked]
  return (
    <figure className="min-w-0 rounded-lg border border-border bg-card px-4 py-3">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-muted-foreground">{title}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{headline}</span>
      </figcaption>
      {points.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No data yet</p>
      ) : (
        <>
          <div className="relative">
            <span className="absolute left-0 top-0 text-[10px] tabular-nums text-muted-foreground">{max}</span>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="block h-24 w-full overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${title}: ${headline} over ${points.length} days. Use arrow keys to inspect each day.`}
              tabIndex={0}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setActive(null)}
              onKeyDown={onKeyDown}
              onBlur={() => setActive(null)}
            >
              <line x1={0} x2={WIDTH} y1={y(0)} y2={y(0)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
              <line x1={0} x2={WIDTH} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              {active !== null && (
                <line x1={x(active)} x2={x(active)} y1={0} y2={HEIGHT} stroke="var(--muted-foreground)" vectorEffect="non-scaling-stroke" />
              )}
              <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {point && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
                  style={{ left: `${(x(marked!) / WIDTH) * 100}%`, top: `${(y(point.value) / HEIGHT) * 100}%` }}
                />
              </>
            )}
            {point && active !== null && (
              <>
                <span
                  role="status"
                  className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-sm"
                  style={{ left: `${Math.min(85, Math.max(15, (x(active) / WIDTH) * 100))}%` }}
                >
                  <span className="text-muted-foreground">{formatDay(point.date)}</span>{' '}
                  <span className="font-semibold tabular-nums">{point.value}</span>
                </span>
              </>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{formatDay(points[0].date)}</span>
            {points.length > 1 && <span>{formatDay(points[points.length - 1].date)}</span>}
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Count</th></tr></thead>
            <tbody>
              {points.map((p) => <tr key={p.date}><td>{formatDay(p.date)}</td><td>{p.value}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
    </figure>
  )
}
