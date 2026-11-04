import { access, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const requiredFunctions = [
  'api-router.func', 'stripe-webhook.func', 'public-site.func',
  '.well-known/workflow/v1/flow.func', '.well-known/workflow/v1/step.func',
  '.well-known/workflow/v1/webhook/[token].func',
]

async function functionNames(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = prefix + entry.name
    if (entry.name.endsWith('.func')) result.push(name)
    else result.push(...await functionNames(join(directory, entry.name), name + '/'))
  }
  return result.sort()
}

/** Refuse to deploy partial output or an accidental per-route API rebuild. */
export async function verifyVercelOutput(root) {
  const output = join(root, '.vercel/output')
  const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'))
  if (config.version !== 3 || !Array.isArray(config.routes)) throw new Error('Missing Build Output API v3 routing')
  const functions = await functionNames(join(output, 'functions'))
  if (JSON.stringify(functions) !== JSON.stringify([...requiredFunctions].sort())) {
    throw new Error(`Unexpected deployment functions: ${functions.join(', ')}`)
  }
  for (const name of functions) {
    const metadata = JSON.parse(await readFile(join(output, 'functions', name, '.vc-config.json'), 'utf8'))
    if (!/^nodejs\d+\.x$/.test(metadata.runtime) || !metadata.handler) throw new Error(`Invalid Node function: ${name}`)
  }
  for (const file of ['index.html', 'app-shell.html', 'dashboard/index.html', 'resources/index.html']) {
    await access(join(output, 'static', file))
  }
  const manifest = JSON.parse(await readFile(join(output, 'diagnostics/workflows-manifest.json'), 'utf8'))
  const workflows = Object.values(manifest.workflows ?? {}).flatMap(file => Object.values(file))
  if (!workflows.some(workflow => workflow.workflowId === 'workflow//./workflows/product-audit//productAuditWorkflow')) throw new Error('Product Audit workflow missing')
  // Check routing order too: Stripe must reach its raw-body handler before the
  // general API router; API routes must precede the public-page catchall.
  const webhook = config.routes.findIndex(route => route.dest === '/stripe-webhook')
  const api = config.routes.findIndex(route => route.dest === '/api-router?__audit_path=$1')
  const fallback = config.routes.findIndex(route => route.src === '^(/.*)$' && route.dest === '/public-site?__public_path=$1')
  if (webhook < 0 || api <= webhook || fallback <= api) throw new Error('Required API routing order is missing')
  const stripe = JSON.parse(await readFile(join(output, 'functions/stripe-webhook.func/.vc-config.json'), 'utf8'))
  if (stripe.shouldAddHelpers !== false) throw new Error('Stripe raw-body handling must stay enabled')
  return functions
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const functions = await verifyVercelOutput(resolve(process.argv[2] ?? '.'))
  console.log(`Verified ${functions.length} deployment functions: ${functions.join(', ')}`)
}
