export const lighthouseBudgets = {
  performance: 0.95,
  accessibility: 1,
  'best-practices': 1,
  seo: 1,
}

export const metricBudgets = {
  'largest-contentful-paint': 2500,
  'total-blocking-time': 200,
  'cumulative-layout-shift': 0.1,
}

// These use the uncompressed local preview, so CDN compression cannot mask bloat.
export const transferBudgets = { script: 450_000, stylesheet: 145_000 }

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Missing/error audits must never silently pass a regression gate. */
export function summarizeReports(reports) {
  const failures = []
  if (!reports.length) throw new Error('No Lighthouse reports to evaluate')
  for (const report of reports) {
    if (report.runtimeError) failures.push(`Lighthouse runtime error: ${report.runtimeError.message}`)
    // The experimental agentic category is a pass fraction, not a quality
    // score. Gate its applicable binary checks; gate CLS as a metric below.
    const references = report.categories?.['agentic-browsing']?.auditRefs
    if (!references?.length) failures.push('agentic-browsing: missing checks')
    for (const { id } of references ?? []) {
      const audit = report.audits?.[id]
      if (!audit || audit.scoreDisplayMode === 'error' || (audit.scoreDisplayMode === 'binary' && audit.score !== 1)) {
        failures.push(`agentic-browsing: ${id} failed`)
      }
    }
  }
  const scores = {}
  for (const [id, minimum] of Object.entries(lighthouseBudgets)) {
    const values = reports.map(report => report.categories?.[id]?.score)
    if (values.some(value => !Number.isFinite(value))) {
      failures.push(`${id}: missing category score`); continue
    }
    scores[id] = median(values)
    if (scores[id] < minimum) failures.push(`${id}: ${Math.round(scores[id] * 100)} < ${minimum * 100}`)
  }
  const metrics = {}
  for (const [id, maximum] of Object.entries(metricBudgets)) {
    const values = reports.map(report => report.audits?.[id]?.numericValue)
    if (values.some(value => !Number.isFinite(value))) {
      failures.push(`${id}: missing metric`); continue
    }
    metrics[id] = median(values)
    if (metrics[id] > maximum) failures.push(`${id}: ${metrics[id]} > ${maximum}`)
  }
  const transfers = {}
  for (const [type, maximum] of Object.entries(transferBudgets)) {
    const values = reports.map(report => report.audits?.['resource-summary']?.details?.items?.find(item => item.resourceType === type)?.transferSize)
    if (values.some(value => !Number.isFinite(value))) {
      failures.push(`${type}: missing transfer size`); continue
    }
    transfers[type] = median(values)
    if (transfers[type] > maximum) failures.push(`${type}: ${transfers[type]} bytes > ${maximum}`)
  }
  return { scores, metrics, transfers, failures }
}
