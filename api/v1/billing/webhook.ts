import type { VercelRequest, VercelResponse } from '@vercel/node'
import { billingConfig, stripeClient, stripeEnabled } from '../../_lib/billing/config.js'
import { processBillingEvent } from '../../_lib/billing/service.js'

export const config = { helpers: false }

function respond(res: VercelResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function webhookBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of (Buffer.isBuffer(req.body) ? [req.body] : req)) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > 1_048_576) throw new Error('Webhook too large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!stripeEnabled()) return respond(res, 404, { error: 'Billing is unavailable' })
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' })
  let settings: ReturnType<typeof billingConfig>
  try { settings = billingConfig() }
  catch { return respond(res, 503, { error: 'Billing is temporarily unavailable' }) }
  let event
  try {
    const signature = req.headers['stripe-signature']
    if (typeof signature !== 'string') throw new Error('Missing signature')
    event = await stripeClient().webhooks.constructEventAsync(await webhookBody(req), signature, settings.webhookSecret)
  } catch { return respond(res, 400, { error: 'Invalid webhook signature or payload' }) }
  try {
    await processBillingEvent(event)
    return respond(res, 200, { received: true })
  } catch {
    // Acknowledge only after durable processing. Stripe retries failures.
    return respond(res, 503, { error: 'Billing event could not be processed' })
  }
}
