import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('checks partial branches in top-level and nested files across every coverage scope', () => {
  const script = resolve('scripts/diff-branch-cov.py')
  const fixture = mkdtempSync(join(tmpdir(), 'crrt-branch-coverage-'))
  const paths = [
    'src/index.ts', 'src/components/Widget.tsx', 'api/comments.ts',
    'apps/dashboard/api.ts', 'apps/dashboard/components/View.tsx',
    'apps/extension/entry.ts', 'apps/landing/App.tsx',
    'shared/product-audit/model.ts', 'workflows/export.ts', 'server/index.ts',
  ]
  const git = (...args: string[]) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe' })
  try {
    git('init', '-b', 'base')
    git('config', 'user.email', 'coverage@example.test')
    git('config', 'user.name', 'Coverage regression')
    for (const path of paths) {
      mkdirSync(dirname(join(fixture, path)), { recursive: true })
      writeFileSync(join(fixture, path), 'export const value = 1\n')
    }
    git('add', '.'); git('commit', '-m', 'base')
    git('switch', '-c', 'change')
    for (const path of paths) writeFileSync(join(fixture, path), 'export const value = 2\n')
    git('add', '.'); git('commit', '-m', 'change')
    const lcov = join(fixture, 'lcov.info')
    const run = () => spawnSync('python3', [script, 'base', lcov], { cwd: fixture, encoding: 'utf8' })
    writeFileSync(lcov, paths.map(path => `SF:${join(fixture, path)}\nDA:1,1\nBRDA:1,0,0,1\nBRDA:1,0,1,0\nend_of_record\n`).join(''))
    const partial = run()
    expect(partial.status, partial.stderr).toBe(1)
    for (const path of paths) expect(partial.stdout).toContain(`${path}\n  L1: 1/2 taken`)
    writeFileSync(lcov, paths.map(path => `SF:${path}\nDA:1,1\nBRDA:1,0,0,1\nBRDA:1,0,1,1\nend_of_record\n`).join(''))
    expect(run().status).toBe(0)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
