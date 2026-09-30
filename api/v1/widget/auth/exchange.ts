import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOptions, jsonError, methodNotAllowed } from '../../../_lib/http.js'
import { exchangeWidgetHandoff, revokeWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (handleOptions(req, res, ['POST', 'DELETE', 'OPTIONS'])) return
  try {
    if (req.method === 'POST') return res.status(200).json(await exchangeWidgetHandoff(req.body ?? {}, req.headers.origin))
    if (req.method === 'DELETE') { await revokeWidgetSession(req); return res.status(204).end() }
    return methodNotAllowed(req, res, ['POST', 'DELETE', 'OPTIONS'])
  } catch (error) {
    return jsonError(req, res, error instanceof WidgetSessionError ? error.status : 500,
      error instanceof WidgetSessionError ? error.message : 'Could not complete widget authentication')
  }
}
