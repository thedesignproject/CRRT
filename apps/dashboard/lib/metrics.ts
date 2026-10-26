import type { DisplayStatus } from './types'

export type StatusCounts = Record<DisplayStatus, number>
export type DailyPoint = { date: string; value: number }

const DAY_MS = 86_400_000

/** Comments still in the workflow: open, ready for an agent, or awaiting testing. */
export function unresolvedCount(counts: Pick<StatusCounts, 'open' | 'ready' | 'ready_for_testing'>) {
  return counts.open + counts.ready + counts.ready_for_testing
}

/** Buckets ISO timestamps into one point per UTC day, ending today, oldest first. */
export function dailyCounts(timestamps: string[], days: number, now = new Date()): DailyPoint[] {
  const today = Math.floor(now.getTime() / DAY_MS)
  const first = today - days + 1
  const values = new Array<number>(Math.max(0, days)).fill(0)
  for (const iso of timestamps) {
    const day = Math.floor(new Date(iso).getTime() / DAY_MS)
    if (day >= first && day <= today) values[day - first]++
  }
  return values.map((value, i) => ({
    date: new Date((first + i) * DAY_MS).toISOString().slice(0, 10),
    value,
  }))
}
