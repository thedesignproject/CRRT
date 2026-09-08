import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { assignExtensionCommentToProject, deleteExtensionComment, ExtensionCommentError, getOwnedExtensionCommentScope, updateExtensionComment } from '../../../_lib/extension-comments.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['PATCH', 'DELETE', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const commentId = getStringQuery(req.query.commentId)
  if (!commentId) return jsonError(req, res, 400, 'Missing commentId')
  try {
    const scope = await getOwnedExtensionCommentScope(user.userId, commentId)
    if (!scope) return jsonError(req, res, 404, 'Comment not found')
    if (scope.projectId && !(await requireProjectMembership(req, res, user, scope.projectId))) return
    if (req.method === 'DELETE') {
      await deleteExtensionComment(user.userId, commentId)
      setCors(req, res, METHODS)
      return res.status(204).end()
    }
    const projectCandidate = req.body?.projectId
    if (projectCandidate !== undefined) {
      if (typeof projectCandidate !== 'string' || !projectCandidate.trim()) {
        return jsonError(req, res, 400, 'projectId must be a non-empty string')
      }
      const projectId = projectCandidate.trim()
      if (!(await requireProjectMembership(req, res, user, projectId))) return
      const result = await assignExtensionCommentToProject(user.userId, commentId, projectId)
      setCors(req, res, METHODS)
      return res.status(200).json(result)
    }
    const result = await updateExtensionComment(user.userId, commentId, req.body?.body)
    setCors(req, res, METHODS)
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof ExtensionCommentError) return jsonError(req, res, error.status, error.message)
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
