// @vitest-environment node
import { Readable } from 'node:stream'
import Stripe from 'stripe'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/billing/config.js', () => ({ stripeEnabled: vi.fn(), billingConfig: vi.fn(), stripeClient: vi.fn() }))
vi.mock('../../_lib/billing/service.js', () => ({ processBillingEvent: vi.fn() }))
import { stripeEnabled, billingConfig, stripeClient } from '../../_lib/billing/config.js'
import { processBillingEvent } from '../../_lib/billing/service.js'
import handler, { config, webhookBody } from './webhook.js'
const stripe = new Stripe('sk_test_example')
const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.paid', livemode: false, data: { object: { customer: 'cus' } } })
const signature = () => stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' })
async function call(options: { method?: string; signature?: unknown; body?: unknown; stream?: boolean } = {}) {
  const req = options.stream ? Readable.from([Buffer.from(payload)]) : { body: options.body ?? Buffer.from(payload) }
  Object.assign(req, { method: options.method ?? 'POST', headers: { 'stripe-signature': options.signature ?? signature() } })
  const res = { statusCode: 200, body: null as unknown, setHeader: vi.fn(), end(value: string) { this.body = JSON.parse(value); return this } }
  await handler(req as never, res as never); return res
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(stripeEnabled).mockReturnValue(true)
  vi.mocked(billingConfig).mockReturnValue({ webhookSecret: 'whsec_test' } as never)
  vi.mocked(stripeClient).mockReturnValue(stripe)
})
it('disables body parsing and processes signed bytes via local buffers and deployed streams', async () => {
  expect(config.helpers).toBe(false)
  expect((await call()).body).toEqual({ received: true })
  expect((await call({ stream: true })).statusCode).toBe(200)
  expect(processBillingEvent).toHaveBeenCalledWith(JSON.parse(payload))
})
it('rejects tampered, unsigned, malformed, stale, and non-scalar signatures', async () => {
  for (const options of [{ body: Buffer.from(payload + ' ') }, { signature: '' }, { signature: ['bad'] }, { signature: 'bad' }, { signature: stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test', timestamp: 1 }) }]) {
    expect((await call(options)).statusCode).toBe(400)
  }
  expect(processBillingEvent).not.toHaveBeenCalled()
})
it('stays inert when disabled and rejects incorrect methods', async () => {
  vi.mocked(stripeEnabled).mockReturnValue(false); expect((await call()).statusCode).toBe(404)
  expect(stripeClient).not.toHaveBeenCalled()
  vi.mocked(stripeEnabled).mockReturnValue(true); expect((await call({ method: 'GET' })).statusCode).toBe(405)
})
it('returns retriable errors for configuration or processing failures', async () => {
  vi.mocked(billingConfig).mockImplementationOnce(() => { throw new Error('missing') })
  expect((await call()).statusCode).toBe(503)
  vi.mocked(processBillingEvent).mockRejectedValueOnce(new Error('database failed'))
  expect((await call()).statusCode).toBe(503)
})
it('bounds stream size and supports empty payloads without accepting them as valid events', async () => {
  expect(await webhookBody(Readable.from([]) as never)).toEqual(Buffer.alloc(0))
  await expect(webhookBody(Readable.from([Buffer.alloc(1_048_577)]) as never)).rejects.toThrow('too large')
})
