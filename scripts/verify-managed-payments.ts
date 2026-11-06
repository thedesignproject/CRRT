// Explicit opt-in smoke test: local Supabase + real Stripe TEST API only.
// bun --env-file=/path/to/.env.docker.local scripts/verify-managed-payments.ts
// Creates and cleans up only its own fixtures. Never truncates tables or changes quotas.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { getNonPersistentSupabase, getServiceSupabase } from '../api/_lib/supabase.js'

const supabaseUrl = new URL(process.env.SUPABASE_URL!)
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(supabaseUrl.hostname), 'Local Supabase required')
assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Stripe test key required')
assert.notEqual(process.env.STRIPE_MODE, 'live', 'Live mode is forbidden')
assert.ok(process.env.STRIPE_WEBHOOK_SECRET, 'Local webhook signing secret required')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const db = getServiceSupabase()
const run = randomUUID()
const users: string[] = [], customers = new Set<string>(), sessions = new Set<string>()
const products: string[] = [], prices: string[] = [], receipts: string[] = []
const catalog: Record<string, string> = {}
let server: ReturnType<typeof Bun.spawn> | undefined
let cleanupFailed = false

async function checked<T extends { error: unknown }>(operation: PromiseLike<T>): Promise<T> {
  const result = await operation
  if (result.error) throw result.error
  return result
}

try {
  for (const [plan, monthly, yearly] of [['pro', 1800, 19200], ['studio', 5400, 49200]] as const) {
    const product = await stripe.products.create({ name: `CRRT ${plan} local verification`, tax_code: 'txcd_10103001', metadata: { crrt_verification: run } })
    products.push(product.id)
    for (const [cycle, interval, amount] of [['monthly', 'month', monthly], ['yearly', 'year', yearly]] as const) {
      const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: amount, recurring: { interval }, tax_behavior: 'exclusive' })
      prices.push(price.id)
      catalog[`${plan}_${cycle}`] = price.id
    }
  }
  // Run this checkout locally without replacing an existing developer's API server.
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') })
  const port = probe.port!
  probe.stop(true)
  const api = `http://127.0.0.1:${port}/api/v1/billing`
  server = Bun.spawn(['bun', 'scripts/local-api.ts'], {
    cwd: new URL('../', import.meta.url).pathname,
    env: { ...process.env, LOCAL_API_PORT: String(port), CRRT_DEPLOYMENT_MODE: 'cloud', STRIPE_ENABLED: 'true', STRIPE_MODE: 'test',
      STRIPE_PRO_PRICE_ID: catalog.pro_monthly, STRIPE_STUDIO_PRICE_ID: catalog.studio_monthly,
      STRIPE_PRO_YEARLY_PRICE_ID: catalog.pro_yearly, STRIPE_STUDIO_YEARLY_PRICE_ID: catalog.studio_yearly },
    stdout: 'pipe', stderr: 'inherit',
  })
  const reader = (server.stdout as ReadableStream<Uint8Array>).getReader()
  const timer = setTimeout(() => server?.kill(), 15_000)
  try {
    let output = ''
    while (!output.includes('local API ready')) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('Local API exited before readiness')
      output += new TextDecoder().decode(chunk.value)
    }
  } finally { clearTimeout(timer); reader.releaseLock() }

  async function fixture(legacy = false) {
    const password = randomUUID() + randomUUID()
    const email = `managed-${run}-${users.length}@example.test`
    const created = await checked(db.auth.admin.createUser({ email, password, email_confirm: true }))
    const id = created.data.user!.id
    users.push(id)
    await checked(db.from('billing_accounts').insert({ user_id: id, is_legacy: legacy }))
    const auth = getNonPersistentSupabase()
    const signed = await checked(auth.auth.signInWithPassword({ email, password }))
    const token = signed.data.session!.access_token
    return { id, token }
  }
  async function request(token: string, body?: object) {
    return fetch(api, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  async function checkout(token: string, plan: string, cycle: string, expectedTrial = true) {
    const response = await request(token, { action: 'checkout', plan, cycle })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    const found = await stripe.checkout.sessions.list({ limit: 100 })
    const session = found.data.find(item => item.url === result.url)
    assert.ok(session, 'Returned Checkout URL must identify a real Stripe session')
    sessions.add(session.id)
    customers.add(session.customer as string)
    const stored = await stripe.checkout.sessions.retrieve(session.id, { expand: ['line_items'] })
    assert.equal(stored.livemode, false)
    assert.equal(stored.managed_payments?.enabled, true)
    assert.equal(stored.payment_method_collection, 'always')
    assert.equal(stored.mode, 'subscription')
    assert.equal(stored.line_items!.data[0].price!.id, catalog[`${plan}_${cycle}`])
    // Checkout's response doesn't echo subscription_data; verify the durable request.
    const { data: admitted } = await checked(db.from('billing_accounts').select('checkout_payload').eq('user_id', stored.client_reference_id!).single())
    assert.equal(admitted.checkout_payload.subscription_data.trial_period_days, expectedTrial ? 14 : undefined)
    const retried = await request(token, { action: 'checkout', plan, cycle })
    assert.equal(retried.status, 200)
    assert.equal((await retried.json()).url, result.url, 'Retry must reuse Checkout')
    return stored
  }
  for (const plan of ['pro', 'studio']) {
    for (const cycle of ['monthly', 'yearly']) {
      const user = await fixture()
      const session = await checkout(user.token, plan, cycle)
      const { data: account } = await checked(db.from('billing_accounts').select('*').eq('user_id', user.id).single())
      assert.equal(account.checkout_payload.managed_payments.enabled, true)
      for (const field of ['automatic_tax', 'payment_method_collection', 'customer_update']) assert.ok(!(field in account.checkout_payload))
      assert.equal(account.checkout_session_id, session.id)
      const summary = await request(user.token)
      assert.equal(summary.status, 200)
      assert.equal((await summary.json()).status, 'none', 'An open Checkout must not grant a subscription')
      await stripe.checkout.sessions.expire(session.id)
      await checked(db.from('billing_accounts').update({ trial_used: true }).eq('user_id', user.id))
      await checkout(user.token, plan, cycle, false)
      console.log(`PASS ${plan}/${cycle}: Managed Payments, required payment method, trial, persisted retry, no second trial`)
    }
  }
  const legacy = await fixture(true)
  for (const cycle of ['monthly', 'yearly']) {
    const blocked = await request(legacy.token, { action: 'checkout', plan: 'pro', cycle })
    assert.equal(blocked.status, 503, 'Legacy Pro must not create paid Checkout')
  }
  const studio = await checkout(legacy.token, 'studio', 'yearly')
  const managed = await request(legacy.token, { action: 'portal' })
  assert.equal(managed.status, 200, 'Legacy portal configuration must be usable')
  assert.ok((await managed.json()).url.startsWith('https://billing.stripe.com/'))
  const { data: row } = await checked(db.from('billing_accounts').select('is_legacy').eq('user_id', legacy.id).single())
  assert.equal(row.is_legacy, true)
  console.log('PASS legacy: Pro blocked on both cycles; managed yearly Studio and restricted Portal available; legacy flag retained')

  const eventId = `evt_local_${run.replaceAll('-', '')}`
  receipts.push(eventId)
  const payload = JSON.stringify({ id: eventId, type: 'checkout.session.completed', livemode: false, data: { object: { customer: studio.customer } } })
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! })
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${api}/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signature }, body: payload })
    assert.equal(response.status, 200, await response.text())
  }
  const bad = await fetch(`${api}/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signature }, body: payload + ' ' })
  assert.equal(bad.status, 400)
  const { data: account } = await checked(db.from('billing_accounts').select('subscription_status,is_legacy').eq('user_id', legacy.id).single())
  assert.equal(account.subscription_status, null, 'Webhook snapshot must not fabricate payment; reconcile real Stripe state')
  assert.equal(account.is_legacy, true)
  console.log('PASS local raw-body webhook: signature, duplicate delivery, tamper rejection, trusted reconciliation')
  console.log('Not exercised: hosted Checkout completion/renewal or Link app controls. Test purchases do not appear in Link.')
} finally {
  server?.kill()
  if (server) await server.exited
  async function cleanup(label: string, operation: () => Promise<unknown>) {
    try { await operation() } catch { cleanupFailed = true; console.error(`Cleanup failed: ${label}`) }
  }
  // Include fixtures created by a partially failed API operation as well.
  for (const id of users) {
    const { data } = await db.from('billing_accounts').select('customer_id,checkout_session_id').eq('user_id', id).maybeSingle()
    if (data?.customer_id) customers.add(data.customer_id)
    if (data?.checkout_session_id) sessions.add(data.checkout_session_id)
  }
  for (const id of sessions) await cleanup(id, async () => { if ((await stripe.checkout.sessions.retrieve(id)).status === 'open') await stripe.checkout.sessions.expire(id) })
  for (const id of customers) await cleanup(id, () => stripe.customers.del(id))
  for (const id of receipts) await cleanup(id, () => checked(db.from('billing_webhook_events').delete().eq('event_id', id)))
  for (const id of users) {
    await cleanup(`billing ${id}`, () => checked(db.from('billing_accounts').delete().eq('user_id', id)))
    await cleanup(`user ${id}`, () => checked(db.auth.admin.deleteUser(id)))
  }
  for (const id of prices) await cleanup(id, () => stripe.prices.update(id, { active: false }))
  for (const id of products) await cleanup(id, () => stripe.products.update(id, { active: false }))
  if (cleanupFailed) throw new Error('Some test fixtures need cleanup; see IDs above')
}
