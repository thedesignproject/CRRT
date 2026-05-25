import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { markAllNotificationsRead } from '../../_lib/store.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    await markAllNotificationsRead(user.userId)
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ ok: true })
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
