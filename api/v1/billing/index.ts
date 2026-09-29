import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed } from '../../_lib/http.js'
import { stripeEnabled, billingConfig } from '../../_lib/billing/config.js'
import { billingSummary, checkout, portal } from '../../_lib/billing/service.js'
import { BillingBusyError } from '../../_lib/billing/store.js'

const METHODS = ['GET', 'POST', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  res.setHeader('Cache-Control', 'no-store')
  if (!stripeEnabled()) {
    if (req.method === 'GET') return res.status(200).json({ enabled: false })
    return jsonError(req, res, 404, 'Billing is unavailable')
  }
  // Billing accepts only the authenticated user's bearer session, never share
  // tokens, reviewer tokens, customer ids, or a requested user id in the body.
  if (!req.headers.authorization?.startsWith('Bearer ')) return jsonError(req, res, 401, 'Unauthorized')
  const user = await requireUser(req, res)
  if (!user) return
  if (req.method === 'GET' && req.query.availability === '1') return res.status(200).json({ enabled: true })
  try {
    billingConfig()
    if (req.method === 'GET') return res.status(200).json(await billingSummary(user.userId))
    if (req.body?.action === 'checkout') return res.status(200).json(await checkout(user))
    if (req.body?.action === 'portal') {
      const result = await portal(user.userId)
      if (!result) return jsonError(req, res, 409, 'Start a subscription before managing billing')
      return res.status(200).json(result)
    }
    return jsonError(req, res, 400, 'Invalid billing action')
  } catch (error) {
    if (error instanceof BillingBusyError) return jsonError(req, res, 409, error.message)
    return jsonError(req, res, 503, 'Billing is temporarily unavailable')
  }
}
