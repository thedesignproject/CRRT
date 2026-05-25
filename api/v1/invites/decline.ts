import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { createNotification, declineInvite } from '../../_lib/store.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  const body = (req.body ?? {}) as { projectKey?: unknown }
  const projectKey = typeof body.projectKey === 'string' ? body.projectKey.trim() : ''
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectKey')

  try {
    const inviterId = await declineInvite(user.email, projectKey)
    // Notif fanout failure can't undo decline; log + continue.
    try {
      await createNotification({
        userId: inviterId,
        kind: 'invite.declined',
        payload: { projectKey, declinedBy: user.userId, email: user.email },
      })
    } catch (notifError) {
      console.warn('invite.declined notif failed:', notifError)
    }
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ projectKey })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    if (msg === 'not_found') return jsonError(req, res, 404, 'Invite not found')
    return jsonError(req, res, 500, msg)
  }
}
