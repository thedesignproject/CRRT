import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import {
  createInvite,
  createNotification,
  findUserIdByEmail,
  getProjectMember,
} from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  // Route param is `projectId` to match the sibling dir (Vercel rejects two
  // different dynamic-segment names at the same path level). The value is
  // still a project public_key — we use that semantic name internally.
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  const body = (req.body ?? {}) as { email?: unknown; role?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role === 'admin' ? 'admin' : 'member'
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonError(req, res, 400, 'Invalid email')
  }

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    const invite = await createInvite({ projectKey, email, role, invitedBy: user.userId })

    // Notif emit is fire-and-forget: invite row is already persisted, and the
    // invitee will still see it on next GET /invites even if realtime fanout
    // fails (e.g. notifications table missing, transient DB error).
    try {
      const inviteeUserId = await findUserIdByEmail(email)
      if (inviteeUserId) {
        await createNotification({
          userId: inviteeUserId,
          kind: 'invite.received',
          payload: { projectKey, email, role, invitedBy: user.userId },
        })
      }
    } catch (notifError) {
      console.warn('invite.received notif failed:', notifError)
    }

    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(201).json(invite)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error'
    if (msg === 'already_invited') return jsonError(req, res, 409, 'Already invited')
    return jsonError(req, res, 500, msg)
  }
}
