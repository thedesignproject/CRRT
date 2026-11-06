import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
process.env.CHROMATIC_ARCHIVE_LOCATION ??= 'artifacts/chromatic-simple/captures'
const errorFile = join(process.env.CHROMATIC_ARCHIVE_LOCATION, 'chromatic-archives/archive/errors.json')
if (existsSync(errorFile) && Object.keys(JSON.parse(readFileSync(errorFile, 'utf8')).errors).length) {
  throw new Error(`Resource archival failed; inspect ${errorFile}`)
}
const adapterRoot = dirname(require.resolve('@chromatic-com/playwright/package.json'))
const adapter = JSON.parse(readFileSync(join(adapterRoot, 'package.json'), 'utf8'))
if (adapter.version !== '1.0.0') throw new Error('Reverify the archive presentation adapter before upgrading @chromatic-com/playwright')
// Reuse the pinned official CLI's viewport preparation, then extend its renderer.
const { t: addViewports } = await import(pathToFileURL(join(adapterRoot, 'dist/set-viewports-Df8HU77_.mjs')).href)
await addViewports()
const storybookPackage = require.resolve('storybook/package.json', { paths: [adapterRoot] })
const storybook = JSON.parse(readFileSync(storybookPackage, 'utf8'))
const result = spawnSync('node', [join(dirname(storybookPackage), storybook.bin), 'build', '-c', 'tests/visual/archive', '--output-dir', 'artifacts/chromatic-simple/storybook', '--disable-telemetry'], { stdio: 'inherit', env: process.env })
process.exitCode = result.status ?? 1
