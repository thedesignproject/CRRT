// Refresh scripts/test-durations.json from Vitest's results cache.
// Run a full suite first (`bun run test`), then `bun run test:durations`.
// Each file's cost is its cached duration plus a fixed per-file overhead for
// environment setup and setup files, which the cache does not include.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PER_FILE_OVERHEAD_MS = 250
const cacheRoot = 'node_modules/.vite/vitest'
const caches = readdirSync(cacheRoot)
  .map((dir) => join(cacheRoot, dir, 'results.json'))
  .filter((path) => {
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  })
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
if (caches.length === 0) throw new Error(`No Vitest results cache under ${cacheRoot}; run the full suite first`)

const { results } = JSON.parse(readFileSync(caches[0], 'utf8')) as { results: [string, { duration?: number }][] }
const files: Record<string, number> = {}
for (const [key, { duration }] of results.sort(([a], [b]) => (a < b ? -1 : 1))) {
  const path = key.startsWith(':') ? key.slice(1) : key
  files[path] = Math.round((duration ?? 0) + PER_FILE_OVERHEAD_MS)
}
writeFileSync('scripts/test-durations.json', `${JSON.stringify({ unit: 'ms', files }, null, 2)}\n`)
console.log(`Wrote ${Object.keys(files).length} file durations from ${caches[0]}`)
