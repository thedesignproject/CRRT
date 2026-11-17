import { expect, it } from 'vitest'
import { partition, shuffle, type ShardManifest } from './vitest-shard-sequencer'
import { verifyShards } from './verify-test-shards'

const files = ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts', 'new.test.ts']
const durations = { 'a.test.ts': 900, 'b.test.ts': 500, 'c.test.ts': 400, 'd.test.ts': 300, 'e.test.ts': 100 }

it('places every file in exactly one shard', () => {
  for (const count of [1, 2, 3, 4, 7]) {
    const parts = partition(files, durations, count)
    expect(parts).toHaveLength(count)
    expect(parts.flat().sort()).toEqual([...files].sort())
  }
})

it('balances by duration, longest first, and prices unknown files at the median', () => {
  // Order: a 900, b 500, c 400, new 400 (median), d 300, e 100; each goes to
  // the lighter shard: a|b, a|b+c, a+new|b+c, then d and e to shard 2.
  expect(partition(files, durations, 2)).toEqual([
    ['a.test.ts', 'new.test.ts'],
    ['b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts'],
  ])
})

it('is deterministic regardless of input order', () => {
  expect(partition([...files].reverse(), durations, 3)).toEqual(partition(files, durations, 3))
})

it('shuffles reproducibly from a seed without losing files', () => {
  const once = shuffle(files, 42)
  expect(shuffle(files, 42)).toEqual(once)
  expect(shuffle(files, 7)).not.toEqual(once)
  expect([...once].sort()).toEqual([...files].sort())
})

const manifest = (
  index: number,
  mine: string[],
  all = ['x', 'y', 'z'],
  count = 2,
  mode: ShardManifest['mode'] = 'full',
): ShardManifest => ({ index, count, mode, all, mine })

it('accepts shards that cover every file exactly once', () => {
  expect(verifyShards([manifest(1, ['x', 'z']), manifest(2, ['y'])])).toEqual([])
})

it('reports missing, duplicated, unclaimed and inconsistent shards', () => {
  expect(verifyShards([])).toEqual(['no shard manifests found'])
  expect(verifyShards([manifest(1, ['x', 'y'])])).toEqual(['missing manifest for shard 2/2', 'z ran in no shard'])
  expect(verifyShards([manifest(1, ['x', 'y']), manifest(2, ['y', 'z'])])).toEqual(['y ran in shards 1 and 2'])
  expect(verifyShards([manifest(1, ['x', 'y', 'z']), manifest(2, [], ['x', 'y'], 3)])).toEqual([
    'shard 2 saw 3 shards, shard 1 saw 2',
    'shard 2 saw a different test file list than shard 1',
  ])
  expect(verifyShards([manifest(1, ['x', 'y', 'z'], undefined, 2, 'changed'), manifest(2, [])])).toEqual([
    'shard 2 ran the full suite, shard 1 ran the changed suite',
  ])
})
