import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { checkout } from '../../../_lib/billing/service.js'
import { stripeEnabled } from '../../../_lib/billing/config.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  try {
    const session = await requireWidgetSession(req)
    const projectKey = typeof req.body?.projectKey === 'string' ? req.body.projectKey : ''
    const pageUrl = typeof req.body?.pageUrl === 'string' ? req.body.pageUrl : ''
    if (!projectKey || !pageUrl) return jsonError(req, res, 400, 'Invalid upgrade request')
    assertWidgetPage(session, projectKey, pageUrl)
    const access = await resolveWidgetAgentAccess(projectKey, session.user_id)
    if (access.state !== 'upgrade_required' || access.ownerUserId !== session.user_id) {
      return jsonError(req, res, 403, 'Only the project owner can upgrade this plan')
    }
    if (!stripeEnabled()) return jsonError(req, res, 404, 'Billing is unavailable')
    const result = await checkout({ userId: session.user_id, email: '' })
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof WidgetSessionError) return jsonError(req, res, error.status, error.message)
    console.error('[widget-agent/upgrade] checkout failed', { error })
    return jsonError(req, res, 503, 'Billing is temporarily unavailable')
  }
}
