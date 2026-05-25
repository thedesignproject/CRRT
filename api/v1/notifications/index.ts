import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { listNotificationsForUser } from '../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  const unreadOnly = getStringQuery(req.query.unreadOnly) === 'true'

  try {
    const notifications = await listNotificationsForUser(user.userId, { unreadOnly })
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(notifications)
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
