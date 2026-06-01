import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, updateProjectName } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['PATCH', 'OPTIONS'])) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, ['PATCH', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  // `projectId` is the project public_key (see sibling invites.ts note).
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  const body = (req.body ?? {}) as { name?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return jsonError(req, res, 400, 'Project name is required')
  if (name.length > 80) return jsonError(req, res, 400, 'Project name must be 80 characters or fewer')

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    const project = await updateProjectName(projectKey, name)
    if (!project) return jsonError(req, res, 404, 'Project not found')

    setCors(req, res, ['PATCH', 'OPTIONS'])
    return res.status(200).json(project)
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
