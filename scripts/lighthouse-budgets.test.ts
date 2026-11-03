import { expect, it } from 'vitest'
import { lighthouseBudgets, metricBudgets, transferBudgets, median, summarizeReports } from './lighthouse-budgets.mjs'

const report = () => ({
  categories: { ...Object.fromEntries(Object.keys(lighthouseBudgets).map(id => [id, { score: 1 }])), 'agentic-browsing': { auditRefs: [{ id: 'llms-txt' }] } },
  audits: {
    ...Object.fromEntries(Object.entries(metricBudgets).map(([id, max]) => [id, { numericValue: max / 2 }])),
    'llms-txt': { score: 1, scoreDisplayMode: 'binary' },
    'resource-summary': { details: { items: Object.entries(transferBudgets).map(([resourceType, maximum]) => ({ resourceType, transferSize: maximum / 2 })) } },
  },
})

it('computes the median for both odd and even run counts', () => {
  expect(median([3, 1, 2])).toBe(2)
  expect(median([4, 2, 1, 3])).toBe(2.5)
})

it('uses the median of repeated runs and rejects a genuine score regression', () => {
  const reports = [report(), report(), report()]
  reports[0].categories.performance.score = 0.6
  expect(summarizeReports(reports).failures).toEqual([])
  reports[1].categories.performance.score = 0.7
  expect(summarizeReports(reports).failures).toContain('performance: 70 < 95')
})

it('fails on missing measurements, runtime errors, or metric regressions', () => {
  expect(() => summarizeReports([])).toThrow('No Lighthouse reports')
  const missing = { categories: {}, audits: {}, runtimeError: { message: 'Load failed' } }
  const failures = summarizeReports([missing]).failures
  expect(failures).toContain('Lighthouse runtime error: Load failed')
  expect(failures).toContain('seo: missing category score')
  expect(failures).toContain('largest-contentful-paint: missing metric')
  expect(failures).toContain('script: missing transfer size')
  expect(failures).toContain('agentic-browsing: missing checks')
  const slow = report()
  slow.audits['largest-contentful-paint'].numericValue = 4000
  expect(summarizeReports([slow]).failures).toContain('largest-contentful-paint: 4000 > 2500')
  const heavy = report()
  heavy.audits['resource-summary'].details.items[0].transferSize = 700_000
  expect(summarizeReports([heavy]).failures).toContain('script: 700000 bytes > 450000')
  const invalid = report()
  invalid.audits['llms-txt'].score = 0
  expect(summarizeReports([invalid]).failures).toContain('agentic-browsing: llms-txt failed')
})

it('partitions every URL across disjoint exhaustive CI shards', async () => {
  const { shardPaths } = await import('./lighthouse-budgets.mjs')
  const paths=Array.from({length:157},(_,index)=>`/resources/example-${index}`)
  const shards=Array.from({length:8},(_,index)=>shardPaths(paths,`${index+1}/8`))
  expect(shardPaths(paths,undefined)).toEqual(paths)
  expect(shards.flat().sort()).toEqual([...paths].sort())
  expect(new Set(shards.flat()).size).toBe(paths.length)
  for(const invalid of ['bad','0/8','9/8','1/0','1/17']) expect(()=>shardPaths(paths,invalid)).toThrow()
  expect(()=>shardPaths(['/resources'],'2/8')).toThrow('selects no URLs')
})
