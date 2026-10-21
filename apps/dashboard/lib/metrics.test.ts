import { describe, expect, it } from 'vitest'
import { dailyCounts, unresolvedCount } from './metrics'

describe('metrics', () => {
  it('counts open, ready, and ready-for-testing comments as unresolved', () => {
    expect(unresolvedCount({ open: 4, ready: 3, ready_for_testing: 2 })).toBe(9)
  })

  it('buckets timestamps into UTC days ending today and ignores out-of-range or invalid ones', () => {
    const now = new Date('2026-10-21T15:00:00Z')
    expect(dailyCounts([
      '2026-10-21T01:00:00Z',
      '2026-10-21T23:59:59Z',
      '2026-10-19T12:00:00Z',
      '2026-10-18T23:59:59Z',
      '2026-10-22T00:00:00Z',
      'not a date',
    ], 3, now)).toEqual([
      { date: '2026-10-19', value: 1 },
      { date: '2026-10-20', value: 0 },
      { date: '2026-10-21', value: 2 },
    ])
    expect(dailyCounts(['2026-10-21T01:00:00Z'], 0, now)).toEqual([])
    expect(dailyCounts([], 1)).toHaveLength(1)
  })
})
