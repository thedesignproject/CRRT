// Vitest sequencer that shards by measured duration instead of file count.
//
// `vitest --shard=i/n` normally hashes paths into n equal-sized buckets, so one
// shard can draw most of the slow files. This partitions files with
// longest-processing-time-first bin packing over scripts/test-durations.json,
// each file's full cost (environment, setup files, import and tests) as
// recorded by `bun run test:durations`.
//
// Every shard must compute the same partition or a file could run twice or
// never. The durations therefore come from a committed file, never from a
// per-runner cache, and VITEST_SHARD_MANIFEST makes each shard record the
// full list and its own share so CI can prove the shards cover every file
// exactly once (scripts/verify-test-shards.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

export type Durations = Record<string, number>

export interface ShardManifest {
  index: number
  count: number
  all: string[]
  mine: string[]
}

function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Deterministic LPT partition. Unknown files cost the median known duration. */
export function partition(files: string[], durations: Durations, count: number): string[][] {
  const known = files.map((file) => durations[file]).filter((cost) => cost !== undefined).sort((a, b) => a - b)
  const fallback = known.length > 0 ? known[Math.floor(known.length / 2)] : 1
  const weighted = files
    .map((file) => ({ file, cost: durations[file] ?? fallback }))
    .sort((a, b) => b.cost - a.cost || byPath(a.file, b.file))
  const shards = Array.from({ length: count }, () => ({ load: 0, files: [] as string[] }))
  for (const { file, cost } of weighted) {
    let target = shards[0]
    for (const shard of shards) if (shard.load < target.load) target = shard
    target.files.push(file)
    target.load += cost
  }
  return shards.map((shard) => shard.files)
}

export function readDurations(path: string | URL): Durations {
  return (JSON.parse(readFileSync(path, 'utf8')) as { files: Durations }).files
}

export class DurationShardSequencer extends BaseSequencer {
  private key(spec: TestSpecification): string {
    const path = relative(this.ctx.config.root, spec.moduleId).split(sep).join('/')
    return spec.project.name ? `${spec.project.name}:${path}` : path
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!
    const keys = files.map((spec) => this.key(spec))
    const parts = partition(keys, readDurations(new URL('./test-durations.json', import.meta.url)), count)
    const mine = new Set(parts[index - 1])
    const manifestPath = process.env.VITEST_SHARD_MANIFEST
    if (manifestPath) {
      const manifest: ShardManifest = { index, count, all: [...keys].sort(byPath), mine: [...mine].sort(byPath) }
      mkdirSync(dirname(manifestPath), { recursive: true })
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
    return files.filter((spec) => mine.has(this.key(spec)))
  }
}
