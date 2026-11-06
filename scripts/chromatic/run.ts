import { rmSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { inventory, mobileScreens } from '../../tests/visual/inventory'
const output = 'artifacts/chromatic-simple'
rmSync(output, { recursive: true, force: true })
const env = { ...process.env, CHROMATIC_ARCHIVE_LOCATION: `${output}/captures` }
for (const args of [
  ['bunx', 'vite', 'build', '--config', 'tests/visual/harness/vite.config.ts'],
  ['bunx', 'playwright', 'test', '-c', 'playwright.visual.config.ts'],
  ['bun', 'scripts/chromatic/build-archive.ts'],
  ['bunx', 'playwright', 'test', '-c', 'playwright.replay.config.ts'],
]) {
  const result = spawnSync(args[0], args.slice(1), { stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const index = JSON.parse(readFileSync(`${output}/storybook/index.json`, 'utf8'))
const expected = Object.values(inventory).reduce((count, states) => count + states.length, 0) + mobileScreens.length
if (Object.keys(index.entries).length !== expected) throw new Error(`Expected ${expected} captures; got ${Object.keys(index.entries).length}`)
const size = (path: string): number => statSync(path).isDirectory() ? readdirSync(path).reduce((sum, file) => sum + size(join(path, file)), 0) : statSync(path).size
console.log(`Verified ${expected} screen/state captures and replays. Archive: ${(size(`${output}/storybook`) / 1_000_000).toFixed(1)} MB.`)
