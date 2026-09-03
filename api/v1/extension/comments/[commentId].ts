import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { deleteExtensionComment, ExtensionCommentError, updateExtensionComment } from '../../../_lib/extension-comments.js'
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
    if (req.method === 'DELETE') {
      await deleteExtensionComment(user.userId, commentId)
      setCors(req, res, METHODS)
      return res.status(204).end()
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
