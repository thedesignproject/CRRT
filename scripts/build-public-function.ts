import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function buildPublicFunction(root: string, output: string) {
  const directory = join(output, 'functions/public-site.func')
  await mkdir(directory, { recursive: true })
  const result = await Bun.build({
    entrypoints: [join(root, 'server/public-site-entry.ts')],
    target: 'node', format: 'esm', outdir: directory, naming: 'index.mjs',
  })
  if (!result.success) throw new AggregateError(result.logs, 'Public page function build failed')
  await cp(join(root, 'apps/landing/dist/public-pages.json'), join(directory, 'public-pages.json'))
  await writeFile(join(directory, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs',
    memory: 128, maxDuration: 10,
  }, null, 2))
}
