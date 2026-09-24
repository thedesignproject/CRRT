// Run after building .vercel/output: node scripts/verify-stripe-runtime.mjs
// Uses dummy test credentials and an ignored, signed event: no Stripe/DB calls.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import Stripe from 'stripe'

const fixtureEnv = {
  STRIPE_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_runtime_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_runtime_fixture', STRIPE_PRICE_ID: 'price_fixture',
  STRIPE_RETURN_URL: 'http://127.0.0.1:5173/dashboard/',
}
const payload = '{\n  "id": "evt_runtime", "type": "payment_intent.created", "livemode": false, "data": {"object": {}}\n}'
const stripe = new Stripe(fixtureEnv.STRIPE_SECRET_KEY)
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: fixtureEnv.STRIPE_WEBHOOK_SECRET })
async function verify(url) {
  let result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload })
  assert.equal(result.status, 200, await result.text())
  result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload + ' ' })
  assert.equal(result.status, 400)
  assert.equal((await fetch(url)).status, 405)
}
const probe = createServer().listen(0, '127.0.0.1')
await once(probe, 'listening')
const port = probe.address().port
await new Promise((resolve) => probe.close(resolve))
const local = spawn('bun', ['scripts/local-api.ts'], { env: { ...process.env, ...fixtureEnv, LOCAL_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
local.stdout.on('data', (chunk) => { output += chunk })
local.stderr.on('data', (chunk) => { output += chunk })
try {
  for (let attempt = 0; !output.includes('local API ready'); attempt++) {
    if (attempt > 100 || local.exitCode !== null) throw new Error(`Local API did not start: ${output}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  await verify(`http://127.0.0.1:${port}/api/v1/billing/webhook`)
  console.log('Local Bun adapter: signed raw-body webhook passed')
} finally {
  local.kill('SIGTERM')
  await once(local, 'exit')
}

const functionRoot = new URL('../.vercel/output/functions/stripe-webhook.func/', import.meta.url)
const config = JSON.parse(await readFile(new URL('.vc-config.json', functionRoot)))
assert.equal(config.shouldAddHelpers, false)
const routes = JSON.parse(await readFile(new URL('../.vercel/output/config.json', import.meta.url))).routes
const webhookRoute = routes.findIndex((route) => route.dest === '/stripe-webhook')
const apiRoute = routes.findIndex((route) => route.dest === '/api-router?__audit_path=$1')
assert.ok(webhookRoute >= 0 && webhookRoute < apiRoute)
Object.assign(process.env, fixtureEnv)
const { default: handler } = await import(new URL(config.handler, functionRoot))
const server = createServer((req, res) => { void handler(req, res) }).listen(0, '127.0.0.1')
await once(server, 'listening')
try {
  const url = `http://127.0.0.1:${server.address().port}/api/v1/billing/webhook`
  await verify(url)
  process.env.STRIPE_ENABLED = 'false'
  delete process.env.STRIPE_SECRET_KEY
  const result = await fetch(url, { method: 'POST', body: 'invalid JSON' })
  assert.equal(result.status, 404)
  console.log('Built Vercel function: signed raw-body webhook and disabled mode passed')
} finally {
  await new Promise((resolve) => server.close(resolve))
}
