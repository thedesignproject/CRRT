import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { requireUser } from '../../../../_lib/auth.js'
import { changeProjectMemberRole, getProject, getProjectMember, getUserEmailsByIds, removeProjectMember, type ProjectMemberRole, type ProjectMemberRoleChange } from '../../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'
import { getProjectRoleChangeDashboardUrl, sendProjectRoleChangeEmail } from '../../../../_lib/project-role-change-email.js'

const METHODS = ['PATCH', 'DELETE', 'OPTIONS']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function sendRoleChangeEmailInBackground(input: {
  change: ProjectMemberRoleChange
  actorEmail: string
  dashboardUrl: string
}) {
  try {
    const [project, emails] = await Promise.all([
      getProject(input.change.projectKey),
      getUserEmailsByIds([input.change.userId]),
    ])
    const recipient = emails[input.change.userId]
    if (!recipient) {
      console.warn('Project role change email skipped: recipient email is missing')
      return
    }
    const result = await sendProjectRoleChangeEmail({
      recipient,
      projectName: project?.name ?? input.change.projectKey,
      actorEmail: input.actorEmail,
      previousRole: input.change.previousRole,
      role: input.change.role,
      dashboardUrl: input.dashboardUrl,
    })
    if (result.skipped) console.warn('Project role change email skipped: email configuration is missing')
  } catch (error) {
    console.warn('Project role change email failed', error)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return

  // `projectId` is the project public_key (see sibling invites.ts note).
  const projectKey = getStringQuery(req.query.projectId)
  const targetUserId = getStringQuery(req.query.userId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  if (!targetUserId) return jsonError(req, res, 400, 'Missing userId')
  if (!UUID_RE.test(targetUserId)) return jsonError(req, res, 400, 'Invalid userId')

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    if (req.method === 'PATCH') {
      const requestedRole = (req.body as { role?: unknown } | undefined)?.role
      if (requestedRole !== 'owner' && requestedRole !== 'admin' && requestedRole !== 'member') {
        return jsonError(req, res, 400, 'Invalid role')
      }
      const changed = await changeProjectMemberRole({
        projectKey,
        actorUserId: user.userId,
        targetUserId,
        role: requestedRole as ProjectMemberRole,
      })
      if (changed.changed && changed.userId !== user.userId) {
        try {
          waitUntil(sendRoleChangeEmailInBackground({
            change: changed,
            actorEmail: user.email,
            dashboardUrl: getProjectRoleChangeDashboardUrl(),
          }))
        } catch (scheduleError) {
          console.warn('Project role change email scheduling failed', scheduleError)
        }
      }
      setCors(req, res, METHODS)
      return res.status(200).json(changed)
    }

    const removed = await removeProjectMember(projectKey, user.userId, targetUserId)
    if (!removed) return jsonError(req, res, 404, 'Member not found')

    setCors(req, res, METHODS)
    return res.status(200).json({ projectKey, userId: targetUserId })
  } catch (error) {
    const msg = error instanceof Error ? error.message : undefined
    if (msg === 'not_found') return jsonError(req, res, 404, 'Member not found')
    if (msg === 'forbidden') return jsonError(req, res, 403, 'Admin role required')
    if (msg === 'owner_required') return jsonError(req, res, 403, 'Only the owner can transfer ownership')
    if (msg === 'owner_protected') return jsonError(req, res, 409, 'Transfer ownership before changing the owner')
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
