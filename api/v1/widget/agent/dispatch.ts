import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { getStringQuery, handleOptions, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { requireWidgetSession, assertWidgetPage, WidgetSessionError } from '../../../_lib/widget-session.js'
import { DispatchError, sendInput, sendDispatch, widgetDispatchState } from '../../../_lib/agent-dispatch.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'POST', 'OPTIONS'])) return
  if (!['GET', 'POST'].includes(req.method ?? '')) return methodNotAllowed(req, res, ['GET', 'POST', 'OPTIONS'])
  setCors(req, res, ['GET', 'POST', 'OPTIONS'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const session = await requireWidgetSession(req)
    if (req.method === 'POST') {
      const input = sendInput.parse(req.body)
      assertWidgetPage(session, input.projectKey, input.pageUrl)
      return res.status(200).json(await sendDispatch(session.user_id, input))
    }
    const project = getStringQuery(req.query.projectKey), page = getStringQuery(req.query.pageUrl)
    if (!project || !page) return res.status(400).json({ code: 'invalid_request' })
    assertWidgetPage(session, project, page)
    return res.status(200).json(await widgetDispatchState(project, page, session.user_id))
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ code: 'invalid_request' })
    if (error instanceof WidgetSessionError) return res.status(error.status).json({ code: 'authentication_required', error: error.message })
    if (error instanceof DispatchError) return res.status(error.status).json({ code: error.code, error: error.message })
    return res.status(503).json({ code: 'dispatch_unavailable' })
  }
}
