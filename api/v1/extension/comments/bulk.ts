import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import {
  bulkAssignExtensionCommentsToProject,
  bulkDeleteExtensionComments,
  ExtensionCommentError,
  parseExtensionCommentBulkSelection,
} from '../../../_lib/extension-comments.js'
import { feedbackVisibilityForRole } from '../../../_lib/project-capabilities.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const operation = req.body?.operation
    const selection = parseExtensionCommentBulkSelection(req.body?.selection)
    if (operation === 'delete') {
      const result = await bulkDeleteExtensionComments(user.userId, selection)
      setCors(req, res, METHODS)
      return res.status(200).json(result)
    }
    if (operation !== 'assign') return jsonError(req, res, 400, 'operation must be assign or delete')

    const projectCandidate = req.body?.projectId
    if (typeof projectCandidate !== 'string' || !projectCandidate.trim()) {
      return jsonError(req, res, 400, 'projectId must be a non-empty string')
    }
    const projectId = projectCandidate.trim()
    const access = await requireProjectCapability(req, res, user, projectId, 'feedback:create')
    if (!access) return
    const requestedVisibility = req.body?.visibility ?? 'shared'
    if (requestedVisibility !== 'shared' && requestedVisibility !== 'internal') {
      return jsonError(req, res, 400, 'visibility must be shared or internal')
    }
    const result = await bulkAssignExtensionCommentsToProject(
      user.userId,
      selection,
      projectId,
      feedbackVisibilityForRole(access.role, requestedVisibility),
    )
    setCors(req, res, METHODS)
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof ExtensionCommentError) return jsonError(req, res, error.status, error.message)
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
