import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed } from '../../../_lib/http.js'
import { createWidgetHandoff, WidgetSessionError } from '../../../_lib/widget-session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return
  try { return res.status(201).json(await createWidgetHandoff(req.body ?? {}, user)) }
  catch (error) {
    return jsonError(req, res, error instanceof WidgetSessionError ? error.status : 500,
      error instanceof WidgetSessionError ? error.message : 'Could not connect the widget')
  }
}
