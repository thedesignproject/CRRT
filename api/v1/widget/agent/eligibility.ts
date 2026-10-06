import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { getStringQuery, handleOptions, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import { sendWidgetAgentError } from '../../../_lib/widget-agent.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  try {
    const session = await requireWidgetSession(req)
    const projectKey = getStringQuery(req.query.projectKey)
    const pageUrl = getStringQuery(req.query.pageUrl)
    if (!projectKey || !pageUrl) return sendWidgetAgentError(req, res, 'project_access_denied')
    assertWidgetPage(session, projectKey, pageUrl)
    const access = await resolveWidgetAgentAccess(projectKey, session.user_id)
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({
      state: access.state,
      role: access.role,
      collaboratorSeatLimit: access.collaboratorSeatLimit,
    })
  } catch (error) {
    if (error instanceof WidgetSessionError) {
      return sendWidgetAgentError(req, res, error.status === 401 ? 'authentication_required' : 'project_access_denied')
    }
    console.error('[widget-agent/eligibility] access check failed', { error })
    return sendWidgetAgentError(req, res, 'error')
  }
}
