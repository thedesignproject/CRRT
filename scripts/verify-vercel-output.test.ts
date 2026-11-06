import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { verifyVercelOutput } from './verify-vercel-output.mjs'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('launches deploy-build from the actual Vercel package alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crrt-vercel-alias-test-'))
  roots.push(root)
  const project = JSON.parse(readFileSync('package.json', 'utf8'))
  await mkdir(join(root, 'scripts'))
  await copyFile('scripts/run-vercel-build.mjs', join(root, 'scripts/run-vercel-build.mjs'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: {
    'vercel-build': project.scripts['vercel-build'],
    'deploy-build': 'node marker.cjs',
  } }))
  await writeFile(join(root, 'marker.cjs'), 'require("node:fs").appendFileSync("build-called.txt", "build\\n")')
  const result = spawnSync('bun', ['run', 'vercel-build'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(join(root, 'build-called.txt'), 'utf8')).toBe('build\n')
  const nested = spawnSync('bun', ['run', 'vercel-build'], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, CRRT_VERCEL_BUILD_ACTIVE: '1' },
  })
  expect(nested.status).not.toBe(0)
  expect(nested.stderr).toContain('Recursive Vercel build prevented')
  expect(readFileSync(join(root, 'build-called.txt'), 'utf8')).toBe('build\n')
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'crrt-prebuilt-test-'))
  roots.push(root)
  const output = join(root, '.vercel/output')
  async function write(path: string, value: unknown) {
    const full = join(output, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const names = ['api-router', 'stripe-webhook', 'public-site', '.well-known/workflow/v1/flow', '.well-known/workflow/v1/step', '.well-known/workflow/v1/webhook/[token]']
  for (const name of names) await write(`functions/${name}.func/.vc-config.json`, { runtime: 'nodejs24.x', handler: 'index.js', shouldAddHelpers: name !== 'stripe-webhook', maxDuration: 60 })
  for (const file of ['index.html', 'app-shell.html', 'dashboard/index.html', 'resources/index.html']) await write('static/' + file, '<html>Built</html>')
  const routes = [
    { src: '^/api/v1/billing/webhook/?$', dest: '/stripe-webhook' },
    { src: '^(/api(?:/.*)?)$', dest: '/api-router?__audit_path=$1' },
    { src: '^(/.*)$', dest: '/public-site?__public_path=$1' },
  ]
  await write('config.json', { version: 3, routes })
  await write('diagnostics/workflows-manifest.json', { workflows: { source: { productAuditWorkflow: { workflowId: 'workflow//./workflows/product-audit//productAuditWorkflow' } } } })
  return { root, output, write, routes }
}

it('accepts the consolidated API, raw-body webhook, public site, and three workflow functions', async () => {
  const { root } = await fixture()
  expect(await verifyVercelOutput(root)).toHaveLength(6)
})

it('rejects missing functions and unintended automatic per-route API outputs', async () => {
  const { root, output, write } = await fixture()
  await write('functions/api/v1/extra.func/.vc-config.json', { runtime: 'nodejs24.x', handler: 'index.js' })
  await expect(verifyVercelOutput(root)).rejects.toThrow('Unexpected deployment functions')
  await rm(join(output, 'functions/api'), { recursive: true })
  await rm(join(output, 'functions/public-site.func'), { recursive: true })
  await expect(verifyVercelOutput(root)).rejects.toThrow('Unexpected deployment functions')
})

it('rejects broken runtime metadata, workflow registration, and missing static entrypoints', async () => {
  const { root, write, output } = await fixture()
  await write('functions/api-router.func/.vc-config.json', { runtime: 'invalid', handler: 'index.js' })
  await expect(verifyVercelOutput(root)).rejects.toThrow('Invalid Node function')
  await write('functions/api-router.func/.vc-config.json', { runtime: 'nodejs24.x', handler: 'index.js' })
  await write('diagnostics/workflows-manifest.json', {})
  await expect(verifyVercelOutput(root)).rejects.toThrow('Product Audit workflow missing')
  await rm(join(output, 'static/dashboard/index.html'))
  await expect(verifyVercelOutput(root)).rejects.toThrow()
})

it('rejects invalid output routing and loss of Stripe raw-body handling', async () => {
  const { root, write, routes } = await fixture()
  await write('config.json', { version: 2, routes })
  await expect(verifyVercelOutput(root)).rejects.toThrow('Build Output API v3')
  await write('config.json', { version: 3, routes: [...routes].reverse() })
  await expect(verifyVercelOutput(root)).rejects.toThrow('routing order')
  await write('config.json', { version: 3, routes })
  await write('functions/stripe-webhook.func/.vc-config.json', { runtime: 'nodejs24.x', handler: 'index.js', shouldAddHelpers: true })
  await expect(verifyVercelOutput(root)).rejects.toThrow('Stripe raw-body')
})

it('rejects accidentally reducing the consolidated API duration limit', async () => {
  const { root, write } = await fixture()
  await write('functions/api-router.func/.vc-config.json', { runtime: 'nodejs24.x', handler: 'index.js', maxDuration: 10 })
  await expect(verifyVercelOutput(root)).rejects.toThrow('60-second duration')
})
