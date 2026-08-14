import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../../_lib/auth.js'
import { getProjectMember, removeProjectMember } from '../../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['DELETE', 'OPTIONS'])) return
  if (req.method !== 'DELETE') return methodNotAllowed(req, res, ['DELETE', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  // `projectId` is the project public_key (see sibling invites.ts note).
  const projectKey = getStringQuery(req.query.projectId)
  const targetUserId = getStringQuery(req.query.userId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  if (!targetUserId) return jsonError(req, res, 400, 'Missing userId')

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    const removed = await removeProjectMember(projectKey, targetUserId)
    if (!removed) return jsonError(req, res, 404, 'Member not found')

    setCors(req, res, ['DELETE', 'OPTIONS'])
    return res.status(200).json({ projectKey, userId: targetUserId })
  } catch (error) {
    const msg = error instanceof Error ? error.message : undefined
    if (msg === 'last_admin') return jsonError(req, res, 409, 'Cannot remove the last admin')
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
