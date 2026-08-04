import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { requireUser } from '../../../_lib/auth.js'
import {
  createInvite,
  createNotification,
  deleteProjectInvite,
  findUserIdByEmail,
  getProject,
  getProjectMember,
  listProjectInvites,
} from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import {
  getProjectInviteDashboardUrl,
  getProjectInviteEmailIdempotencyKey,
  sendProjectInviteEmail,
} from '../../../_lib/project-invite-email.js'

const METHODS = ['GET', 'POST', 'DELETE', 'OPTIONS']

async function sendProjectInviteEmailInBackground(input: {
  email: string
  inviterEmail: string
  projectKey: string
  role: 'admin' | 'member'
  dashboardUrl: string
  idempotencyKey: string
}) {
  try {
    const project = await getProject(input.projectKey)
    const result = await sendProjectInviteEmail({
      recipient: input.email,
      projectName: project?.name ?? input.projectKey,
      inviterEmail: input.inviterEmail,
      role: input.role,
      dashboardUrl: input.dashboardUrl,
      idempotencyKey: input.idempotencyKey,
    })
    if (result.skipped) console.warn('Project invite email skipped: email configuration is missing')
  } catch (error) {
    console.warn('Project invite email failed', error)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return methodNotAllowed(req, res, METHODS)
  }
  const user = await requireUser(req, res)
  if (!user) return

  // Route param is `projectId` to match the sibling dir (Vercel rejects two
  // different dynamic-segment names at the same path level). The value is
  // still a project public_key — we use that semantic name internally.
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    if (req.method === 'GET') {
      const invites = await listProjectInvites(projectKey)
      setCors(req, res, METHODS)
      return res.status(200).json(invites)
    }

    if (req.method === 'DELETE') {
      const email = (getStringQuery(req.query.email) ?? '').trim().toLowerCase()
      if (!email) return jsonError(req, res, 400, 'Missing email')
      const cancelled = await deleteProjectInvite(projectKey, email)
      if (!cancelled) return jsonError(req, res, 404, 'Invite not found')
      setCors(req, res, METHODS)
      return res.status(200).json({ projectKey, email })
    }

    // POST: send an invite.
    const body = (req.body ?? {}) as { email?: unknown; role?: unknown }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role === 'admin' ? 'admin' : 'member'
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonError(req, res, 400, 'Invalid email')
    }

    const invite = await createInvite({ projectKey, email, role, invitedBy: user.userId })

    try {
      waitUntil(sendProjectInviteEmailInBackground({
        email,
        inviterEmail: user.email,
        projectKey,
        role,
        dashboardUrl: getProjectInviteDashboardUrl(),
        idempotencyKey: getProjectInviteEmailIdempotencyKey(projectKey, email),
      }))
    } catch (scheduleError) {
      console.warn('Project invite email scheduling failed', scheduleError)
    }

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

    setCors(req, res, METHODS)
    return res.status(201).json(invite)
  } catch (error) {
    const msg = error instanceof Error ? error.message : undefined
    if (msg === 'already_invited') return jsonError(req, res, 409, 'Already invited')
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
