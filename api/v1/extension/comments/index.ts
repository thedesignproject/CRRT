import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import { createExtensionComment, ExtensionCommentError, listExtensionComments } from '../../../_lib/extension-comments.js'
import { feedbackVisibilityForRole, type FeedbackVisibility } from '../../../_lib/project-capabilities.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['GET', 'POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  try {
    const candidate = req.method === 'GET' ? req.query.projectId : req.body?.projectId
    const projectId = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
    if (candidate !== undefined && candidate !== null && candidate !== '' && !projectId) {
      return jsonError(req, res, 400, 'projectId must be a string')
    }
    const access = projectId
      ? await requireProjectCapability(req, res, user, projectId, req.method === 'GET' ? 'feedback:read' : 'feedback:create')
      : null
    if (projectId && !access) return
    const requestedVisibility = req.method === 'POST' && req.body?.visibility !== undefined
      ? req.body.visibility
      : 'shared'
    if (requestedVisibility !== 'shared' && requestedVisibility !== 'internal') {
      return jsonError(req, res, 400, 'visibility must be shared or internal')
    }
    const visibility: FeedbackVisibility = access
      ? feedbackVisibilityForRole(access.role, requestedVisibility)
      : 'shared'
    const result = req.method === 'GET'
      ? await listExtensionComments(user.userId, { ...req.query, projectId }, access?.role === 'guest' ? 'shared' : undefined)
      : await createExtensionComment(user.userId, req.body ?? {}, projectId, user.email, visibility)
    setCors(req, res, METHODS)
    return res.status(req.method === 'POST' ? 201 : 200).json(result)
  } catch (error) {
    if (error instanceof ExtensionCommentError) return jsonError(req, res, error.status, error.message)
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
