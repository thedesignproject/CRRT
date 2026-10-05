import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { getComment, resolveTrackerDispatch } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

// Admins explicitly acknowledge that an issue may already exist in the tracker.
// The database also rejects resolution while a live sender holds its lock.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return
  const commentId = getStringQuery(req.query.commentId)
  const provider = req.body?.provider
  if (!commentId) return jsonError(req, res, 400, 'Missing commentId')
  if (!['github', 'linear', 'jira'].includes(provider) || req.body?.confirmCheckedTracker !== true) return jsonError(req, res, 400, 'Check the tracker before resolving a pending export')
  try {
    const comment = await getComment(commentId)
    if (!comment?.projectId) return jsonError(req, res, 404, 'Comment not found')
    const resolved = await resolveTrackerDispatch(comment.projectId, user.userId, commentId, provider)
    if (!resolved) return jsonError(req, res, 404, 'No pending export')
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ resolved: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'forbidden') return jsonError(req, res, 403, 'Project admin required')
    if (code === 'tracker_dispatch_active') return jsonError(req, res, 409, 'The export is still running. Wait for it to finish before resolving it.')
    return jsonError(req, res, 500, 'Could not resolve the pending export')
  }
}
