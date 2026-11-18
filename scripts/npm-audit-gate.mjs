// Fails CI on high or critical runtime advisories from `npm audit --json`,
// except advisories the team has reviewed and listed below. Keep each
// exception temporary: remove it as soon as a patched release exists.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const ignored = new Map([
  ['GHSA-fc5q-39xc-vjpf', 'picomatch ReDoS: every release through 4.0.7 is affected and no patched version exists yet. Remove once picomatch ships a fix.'],
])

const blocking = new Set(['high', 'critical'])

export function blockingAdvisories(report) {
  if (!report || typeof report !== 'object' || report.error || typeof report.vulnerabilities !== 'object') {
    throw new Error(`npm audit did not return a report: ${JSON.stringify(report?.error ?? report)}`)
  }
  const found = new Map()
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of entry.via) {
      // String entries only point at another vulnerable package; the advisory itself is reported there.
      if (typeof via !== 'object' || !blocking.has(via.severity)) continue
      if (ignored.has(String(via.url).split('/').pop())) continue
      found.set(via.url, `${via.name}: ${via.title} (${via.severity}) ${via.url}`)
    }
  }
  return [...found.values()]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const found = blockingAdvisories(JSON.parse(readFileSync(0, 'utf8')))
  for (const [id, reason] of ignored) console.log(`Ignoring ${id}: ${reason}`)
  if (found.length) {
    console.error(`Unreviewed high or critical runtime advisories:\n${found.join('\n')}`)
    process.exit(1)
  }
  console.log('No unreviewed high or critical runtime advisories.')
}
