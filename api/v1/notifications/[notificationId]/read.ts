import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { markNotificationRead } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  const notificationId = getStringQuery(req.query.notificationId)
  if (!notificationId) return jsonError(req, res, 400, 'Missing notificationId')

  try {
    const updated = await markNotificationRead(notificationId, user.userId)
    if (!updated) return jsonError(req, res, 404, 'Notification not found')
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ id: notificationId, read: true })
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
