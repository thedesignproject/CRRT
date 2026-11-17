// Prove a sharded run covered every test file exactly once.
// Usage: bun scripts/verify-test-shards.ts <dir containing shard-*.json manifests>
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ShardManifest } from './vitest-shard-sequencer'

export function verifyShards(manifests: ShardManifest[]): string[] {
  if (manifests.length === 0) return ['no shard manifests found']
  const [first] = manifests
  const errors: string[] = []
  const indexes = new Set(manifests.map((m) => m.index))
  for (let i = 1; i <= first.count; i += 1) if (!indexes.has(i)) errors.push(`missing manifest for shard ${i}/${first.count}`)
  const expected = JSON.stringify(first.all)
  for (const m of manifests) {
    if (m.count !== first.count) errors.push(`shard ${m.index} saw ${m.count} shards, shard ${first.index} saw ${first.count}`)
    if (JSON.stringify(m.all) !== expected) errors.push(`shard ${m.index} saw a different test file list than shard ${first.index}`)
  }
  const owner = new Map<string, number>()
  for (const m of manifests) {
    for (const file of m.mine) {
      const previous = owner.get(file)
      if (previous !== undefined) errors.push(`${file} ran in shards ${previous} and ${m.index}`)
      owner.set(file, m.index)
    }
  }
  for (const file of first.all) if (!owner.has(file)) errors.push(`${file} ran in no shard`)
  return errors
}

if (import.meta.main) {
  const dir = process.argv[2]
  const manifests = readdirSync(dir)
    .filter((name) => /^shard-.*\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as ShardManifest)
  const errors = verifyShards(manifests)
  if (errors.length > 0) {
    for (const error of errors) console.error(`::error::${error}`)
    process.exit(1)
  }
  console.log(`${manifests[0].all.length} test files ran exactly once across ${manifests.length} shards`)
}
