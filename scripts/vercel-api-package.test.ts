import { expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runPackageJsonScript } from '@vercel/build-utils'
import { apiBuilderPackage } from './vercel-api-package.mjs'

it('preserves dependency resolution and ordinary scripts while removing deployment hooks', () => {
  const original = {
    name: 'fixture', type: 'module', dependencies: { stripe: '22.6.2' },
    scripts: { 'vercel-build': 'must-not-run', 'now-build': 'must-not-run', build: 'tsc', test: 'vitest' },
    overrides: { dependency: '1.0.0' }, patchedDependencies: { dependency: 'patches/dependency.patch' },
  }
  const sanitized = JSON.parse(apiBuilderPackage(JSON.stringify(original)))
  expect(sanitized).toEqual({ ...original, scripts: { build: 'tsc', test: 'vitest' } })
  expect(original.scripts['vercel-build']).toBe('must-not-run')
  expect(JSON.parse(apiBuilderPackage('{"name":"no-scripts"}'))).toEqual({ name: 'no-scripts' })
})

it('prevents the real Vercel builder hook lookup from finding a parent deployment script', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crrt-api-builder-test-'))
  try {
    const api = join(root, 'api')
    await mkdir(api)
    await writeFile(join(root, 'package.json'), apiBuilderPackage(JSON.stringify({
      name: 'fixture', scripts: {
        'vercel-build': 'node -e "process.exit(99)"',
        'now-build': 'node -e "process.exit(99)"',
      },
    })))
    expect(await runPackageJsonScript(api, ['vercel-build', 'now-build'])).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
