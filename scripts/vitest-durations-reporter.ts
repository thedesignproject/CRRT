// Vitest reporter for `bun run test:durations`: records each test file's full
// cost to scripts/test-durations.json, which the duration-balanced shard
// sequencer (scripts/vitest-shard-sequencer.ts) reads. A file's cost is what
// a worker spends on it: environment setup, harness, setup files, importing
// the file and running its tests. Test time alone undercounts the files that
// pay for a DOM environment or heavy imports.
import { writeFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import type { Reporter, TestModule } from 'vitest/node'

export default class DurationsReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const entries = modules.map((module) => {
      const d = module.diagnostic()
      const path = relative(module.project.config.root, module.moduleId).split(sep).join('/')
      const key = module.project.name ? `${module.project.name}:${path}` : path
      const cost = d.environmentSetupDuration + d.prepareDuration + d.setupDuration + d.collectDuration + d.duration
      return [key, Math.round(cost)] as const
    })
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    writeFileSync('scripts/test-durations.json', `${JSON.stringify({ unit: 'ms', files: Object.fromEntries(entries) }, null, 2)}\n`)
  }
}
