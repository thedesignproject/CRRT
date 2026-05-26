import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { createFeedbackEvent, findActiveSharesForComment, getComment, updateImplementationStatus } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { IMPLEMENTATION_STATUSES, type ImplementationStatus } from '../../../_lib/status.js'

const VALID_STATUSES = new Set<ImplementationStatus>(IMPLEMENTATION_STATUSES)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['PATCH', 'OPTIONS'])) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, ['PATCH', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const commentId = getStringQuery(req.query.commentId)
    const implementationStatus = req.body?.implementationStatus as ImplementationStatus | undefined

    if (!commentId) return jsonError(req, res, 400, 'Missing commentId')
    if (!implementationStatus || !VALID_STATUSES.has(implementationStatus)) {
      return jsonError(req, res, 400, `implementationStatus must be one of: ${IMPLEMENTATION_STATUSES.join(', ')}`)
    }

    const existing = await getComment(commentId)
    if (!existing || !existing.projectId) return jsonError(req, res, 404, 'Comment not found')
    if (!(await requireProjectMembership(req, res, user, existing.projectId))) return

    const [comment, activeShares] = await Promise.all([
      updateImplementationStatus(commentId, { implementationStatus }),
      findActiveSharesForComment(commentId),
    ])
    await Promise.all(activeShares.map((share) => createFeedbackEvent({
      shareId: share.id,
      commentId,
      actorType: 'reviewer',
      actorId: 'reviewer',
      eventType: 'comment.implementation_changed',
      payload: { implementationStatus },
    })))

    setCors(req, res, ['PATCH', 'OPTIONS'])
    return res.status(200).json(comment)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
