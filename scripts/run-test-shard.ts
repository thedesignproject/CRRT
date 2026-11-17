// Run one CI test shard: `bun scripts/run-test-shard.ts <index>/<count>`.
//
// SELECTION_BASE (pull requests only) narrows the run to the tests the diff can
// reach, when scripts/test-selection.ts allows it; otherwise the full suite
// runs. COVERAGE=true writes a blob report for check (react 19) to merge.
// VITEST_SHARD_MANIFEST records this shard's share for verify-test-shards.ts.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import { parseNameStatus, selectionMode, type Mode } from './test-selection'
import type { ShardManifest } from './vitest-shard-sequencer'

const vitest = './node_modules/.bin/vitest'
const shard = process.argv[2]
const [index, count] = shard.split('/').map(Number)
const base = process.env.SELECTION_BASE
const manifestPath = process.env.VITEST_SHARD_MANIFEST!

let mode: Mode = 'full'
let affected: string[] = []
if (base) {
  const diff = execFileSync('git', ['diff', '--name-status', '-M', `${base}...HEAD`], { encoding: 'utf8' })
  const decision = selectionMode(parseNameStatus(diff))
  if (decision.mode === 'changed') {
    const listed = execFileSync(vitest, ['list', '--changed', base, '--filesOnly', '--json'], { encoding: 'utf8' })
    affected = (JSON.parse(listed) as { file: string }[])
      .map(({ file }) => relative(process.cwd(), file).split(sep).join('/'))
      .sort()
    if (affected.length > 0) mode = 'changed'
    else decision.reasons.push('no test imports the changed files')
  }
  console.log(
    mode === 'changed'
      ? `Selection: ${affected.length} test files reachable from the diff`
      : `Selection: full suite\n  ${decision.reasons.join('\n  ')}`,
  )
}

const args = ['run', `--shard=${shard}`]
if (mode === 'changed') args.push('--changed', base!, '--passWithNoTests')
if (process.env.COVERAGE === 'true')
  args.push('--coverage', '--coverage.reporter=json-summary', '--reporter=default', '--reporter=blob')
const run = spawnSync(vitest, args, { stdio: 'inherit', env: { ...process.env, VITEST_SELECTION_MODE: mode } })
if (run.status !== 0) process.exit(run.status ?? 1)

// With --changed, a shard can draw no files; Vitest then exits before the
// sequencer runs. Record an empty share so verification still cross-checks it
// against the other shards' complete list.
if (mode === 'changed' && !existsSync(manifestPath)) {
  const manifest: ShardManifest = { index, count, mode, all: affected, mine: [] }
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
