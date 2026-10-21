import { cn } from '../lib/utils'

export function MetricCard({ label, value, detail, onOpen }: {
  label: string
  value: number
  detail?: string
  onOpen?: () => void
}) {
  const body = (
    <>
      <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value.toLocaleString('en-US')}
      </span>
      {detail && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>}
    </>
  )
  const base = 'block w-full min-w-0 rounded-lg border border-border bg-card px-4 py-3 text-left'
  if (!onOpen) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(base, 'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring btn-press')}
    >
      {body}
    </button>
  )
}
