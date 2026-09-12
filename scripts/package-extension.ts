import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectReleaseFiles, readExtensionVersion, relativeReleasePath, releaseMetadata, validateReleaseFiles } from '../apps/extension/release'

const root = process.cwd()
const extensionRoot = resolve(root, 'apps/extension')
const outputRoot = resolve(extensionRoot, '.output')
const unpackedRoot = resolve(outputRoot, 'chrome-mv3')
const version = readExtensionVersion(resolve(extensionRoot, 'package.json'))
const required = ['WXT_API_BASE', 'WXT_DASHBOARD_URL', 'WXT_SUPABASE_URL', 'WXT_SUPABASE_ANON_KEY'] as const
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required for a Store release`)
}

const build = spawnSync('bunx', ['wxt', 'zip', '--config', 'apps/extension/wxt.config.ts'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})
if (build.status !== 0) throw new Error(`WXT release build failed with status ${build.status ?? 'unknown'}`)

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(absolute) : [relativeReleasePath(unpackedRoot, absolute)]
  })
}

const validation = validateReleaseFiles(collectReleaseFiles(unpackedRoot, walk(unpackedRoot)), {
  version,
  apiBase: process.env.WXT_API_BASE!,
  supabaseUrl: process.env.WXT_SUPABASE_URL!,
})
const sourceZip = readdirSync(outputRoot)
  .filter((name) => name.endsWith(`-${version}-chrome.zip`))
  .map((name) => resolve(outputRoot, name))
  .find((file) => statSync(file).isFile())
if (!sourceZip) throw new Error('WXT did not produce the expected Chrome ZIP')

const commit = process.env.GITHUB_SHA ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const commitEpoch = spawnSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).stdout.trim()
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH ?? commitEpoch)
const zip = readFileSync(sourceZip)
const apiOrigin = new URL(process.env.WXT_API_BASE!).origin
const supabaseOrigin = new URL(process.env.WXT_SUPABASE_URL!).origin
const metadata = releaseMetadata({ version, commit, sourceDateEpoch, zip, validation, apiOrigin, supabaseOrigin })

const artifacts = resolve(root, 'artifacts')
mkdirSync(artifacts, { recursive: true })
const zipTarget = resolve(artifacts, `crrt-extension-${version}-chrome.zip`)
const metadataTarget = resolve(artifacts, `crrt-extension-${version}-release.json`)
copyFileSync(sourceZip, zipTarget)
writeFileSync(metadataTarget, `${JSON.stringify(metadata, null, 2)}\n`)
console.log(`Validated ${metadata.files.length} files (${metadata.unpackedBytes} bytes)`)
console.log(`${zipTarget}: ${metadata.zipSha256}`)
console.log(metadataTarget)
