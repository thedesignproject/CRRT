// Decide whether a pull request may run only the tests its diff can reach.
//
// `vitest --changed` follows the module graph, including dynamic import(), but
// it cannot see files a test reads with fs (CSS tokens, Markdown, SQL
// migrations, package.json), scripts a test runs as a subprocess, the shared
// setup file, or modules that were deleted or renamed. Measured on this repo:
// a change to branding/crrt/tokens.css or scripts/record-worker.ts selects no
// tests at all, although selector-motion.test.ts and record-worker-node.test.ts
// depend on them. Any such change runs the full suite. The merge queue and
// trunk always run the full suite.

export interface Change {
  status: string
  path: string
}

export type Mode = 'full' | 'changed'

const MODULE = /\.[cm]?[jt]sx?$/
const SUBPROCESS_ROOTS = ['scripts/']
const SUITE_WIDE = new Set(['vitest.config.ts', 'vite.config.ts', 'src/__tests__/setup.ts'])

export function parseNameStatus(output: string): Change[] {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [status, ...paths] = line.split('\t')
      return { status, path: paths[paths.length - 1] }
    })
}

export function selectionMode(changes: Change[]): { mode: Mode; reasons: string[] } {
  const reasons: string[] = []
  for (const { status, path } of changes) {
    if (status !== 'A' && status !== 'M') reasons.push(`${path}: ${status} (deleted, renamed or copied)`)
    else if (!MODULE.test(path)) reasons.push(`${path}: not a JS/TS module, so tests may read it with fs`)
    else if (SUBPROCESS_ROOTS.some((root) => path.startsWith(root)))
      reasons.push(`${path}: tests run scripts as subprocesses`)
    else if (SUITE_WIDE.has(path)) reasons.push(`${path}: test setup or config`)
  }
  if (changes.length === 0) reasons.push('no changes against the base')
  return { mode: reasons.length === 0 ? 'changed' : 'full', reasons }
}
