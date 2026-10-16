import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed } from '../../_lib/http.js'
import { stripeEnabled, billingConfig } from '../../_lib/billing/config.js'
import { billingSummary, checkout, portal } from '../../_lib/billing/service.js'
import { cloudBillingSummary } from '../../_lib/billing/cloud-summary.js'
import { isCloud, parseCloudPlan, parseBillingCycle, cloudPriceCatalog } from '../../_lib/billing/plans.js'
import { BillingBusyError } from '../../_lib/billing/store.js'

import { createCheckoutState, readCheckoutState, InvalidCheckoutState } from '../../_lib/billing/checkout-state.js'

const METHODS = ['GET', 'POST', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  res.setHeader('Cache-Control', 'no-store')
  if (!stripeEnabled()) {
    if (req.method === 'GET') return res.status(200).json({ enabled: false })
    return jsonError(req, res, 404, 'Billing is unavailable')
  }
  if (req.method === 'GET' && req.query.start !== undefined) {
    try {
      const plan = parseCloudPlan(req.query.start)
      const cycle = parseBillingCycle(req.query.cycle)
      cloudPriceCatalog(process.env, cycle)
      const destination = new URL(billingConfig().returnUrl)
      destination.search = new URLSearchParams({ billingState: createCheckoutState(plan, cycle) }).toString()
      destination.hash = ''
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Location', destination.href)
      return res.status(303).end()
    } catch (error) {
      if (error instanceof Error && (error.message === 'Choose Cloud Pro or Cloud Studio' || error.message === 'Choose monthly or yearly billing')) return jsonError(req, res, 400, error.message)
      return jsonError(req, res, 503, 'Billing is temporarily unavailable')
    }
  }
  // Billing accepts only the authenticated user's bearer session, never share
  // tokens, reviewer tokens, customer ids, or a requested user id in the body.
  if (!req.headers.authorization?.startsWith('Bearer ')) return jsonError(req, res, 401, 'Unauthorized')
  const user = await requireUser(req, res)
  if (!user) return
  if (req.method === 'GET' && req.query.availability === '1') return res.status(200).json({ enabled: true })
  try {
    billingConfig()
    if (req.method === 'GET') return res.status(200).json(await (isCloud() ? cloudBillingSummary(user.userId) : billingSummary(user.userId)))
    if (req.body?.action === 'checkout_state') {
      const selection = readCheckoutState(req.body.state)
      return res.status(200).json(await checkout(user, selection.plan, selection.cycle))
    }
    if (req.body?.action === 'checkout') {
      if (!isCloud()) return res.status(200).json(await checkout(user))
      let plan, cycle
      try { plan = parseCloudPlan(req.body.plan); cycle = parseBillingCycle(req.body.cycle) }
      catch (error) { return jsonError(req, res, 400, (error as Error).message) }
      return res.status(200).json(await checkout(user, plan, cycle))
    }
    if (req.body?.action === 'portal') {
      const result = await portal(user.userId)
      if (!result) return jsonError(req, res, 409, 'Start a subscription before managing billing')
      return res.status(200).json(result)
    }
    return jsonError(req, res, 400, 'Invalid billing action')
  } catch (error) {
    if (error instanceof InvalidCheckoutState) return jsonError(req, res, 400, error.message)
    if (error instanceof BillingBusyError) return jsonError(req, res, 409, error.message)
    return jsonError(req, res, 503, 'Billing is temporarily unavailable')
  }
}
