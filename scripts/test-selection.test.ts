import { expect, it } from 'vitest'
import { parseNameStatus, selectionMode } from './test-selection'

it('parses added, modified, renamed and deleted paths', () => {
  expect(parseNameStatus('M\tsrc/a.ts\nA\tapi/b.ts\nR100\told.ts\tnew.ts\nD\tgone.ts\n')).toEqual([
    { status: 'M', path: 'src/a.ts' },
    { status: 'A', path: 'api/b.ts' },
    { status: 'R100', path: 'new.ts' },
    { status: 'D', path: 'gone.ts' },
  ])
})

it('narrows when every change is an added or modified module the graph can see', () => {
  expect(
    selectionMode([
      { status: 'M', path: 'apps/extension/entrypoints/recordings/main.tsx' },
      { status: 'A', path: 'src/lib/new.test.ts' },
    ]),
  ).toEqual({ mode: 'changed', reasons: [] })
})

it.each([
  // Measured misses of `vitest --changed`: both select no tests.
  ['M', 'branding/crrt/tokens.css', 'not a JS/TS module'],
  ['M', 'scripts/record-worker.ts', 'subprocesses'],
  ['M', 'db/migrations/0035_agent_collaborator_seats.sql', 'not a JS/TS module'],
  ['M', 'package.json', 'not a JS/TS module'],
  ['M', 'src/__tests__/setup.ts', 'setup or config'],
  ['M', 'vitest.config.ts', 'setup or config'],
  ['D', 'src/lib/old.ts', 'deleted'],
  ['R087', 'src/lib/moved.ts', 'renamed'],
])('runs the full suite for %s %s', (status, path, reason) => {
  const { mode, reasons } = selectionMode([
    { status: 'M', path: 'src/index.ts' },
    { status, path },
  ])
  expect(mode).toBe('full')
  expect(reasons).toHaveLength(1)
  expect(reasons[0]).toContain(reason)
})

it('runs the full suite when there is nothing to compare', () => {
  expect(selectionMode([])).toEqual({ mode: 'full', reasons: ['no changes against the base'] })
})
