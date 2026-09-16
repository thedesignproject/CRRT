import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { getComment, removeGuestCommentActivityNotifications, updateCommentVisibility } from '../../../_lib/store.js'

const METHODS = ['PATCH', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const commentId = getStringQuery(req.query.commentId)
  if (!commentId) return jsonError(req, res, 400, 'Missing commentId')
  const visibility = req.body?.visibility
  if (visibility !== 'shared' && visibility !== 'internal') {
    return jsonError(req, res, 400, 'visibility must be shared or internal')
  }

  try {
    const existing = await getComment(commentId)
    if (!existing?.projectId) return jsonError(req, res, 404, 'Comment not found')
    if (!(await requireProjectCommentCapability(req, res, user, existing, 'feedback:manage'))) return
    const updated = await updateCommentVisibility(existing.projectId, commentId, visibility)
    if (!updated) return jsonError(req, res, 404, 'Comment not found')
    if (visibility === 'internal') {
      await removeGuestCommentActivityNotifications(existing.projectId, commentId)
    }
    setCors(req, res, METHODS)
    return res.status(200).json(updated)
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
