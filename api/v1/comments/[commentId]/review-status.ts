import type { VercelRequest, VercelResponse } from '@vercel/node'
import { waitUntil } from '@vercel/functions'
import { z } from 'zod'
import { prepareFeedbackUndo, readFeedbackUndo } from '../../../_lib/feedback-undo.js'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { createFeedbackEvent, findActiveSharesForComment, getComment, mutateProjectFeedback } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { IMPLEMENTATION_STATUSES, type ImplementationStatus, type ReviewStatus } from '../../../_lib/status.js'
import { closeLinkedExternalWork } from '../../../_lib/external-work-sync.js'

const VALID_STATUSES = new Set<ReviewStatus>(['open', 'accepted', 'rejected'])
const VERSION_TIMESTAMP = z.iso.datetime({ offset: true })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['PATCH', 'OPTIONS'])) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, ['PATCH', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const commentId = getStringQuery(req.query.commentId)
    let reviewStatus = req.body?.reviewStatus as ReviewStatus | undefined
    let expectedUpdatedAt = req.body?.expectedUpdatedAt
    let implementationStatus = req.body?.implementationStatus as ImplementationStatus | undefined
    const captureUndo = req.body?.captureUndo === true
    const preserveExternalWork = req.body?.preserveExternalWork === true
    const undoToken = req.body?.undoToken
    const existing = commentId ? await getComment(commentId) : null
    let restoredClaim: string | null | undefined
    if (undoToken !== undefined) {
      if (!existing?.projectId) return jsonError(req, res, 404, 'Comment not found')
      const snapshot = readFeedbackUndo(undoToken, user.userId, existing.projectId, existing.id)
      if (!snapshot) return jsonError(req, res, 400, 'Invalid or expired Undo')
      reviewStatus = snapshot.reviewStatus
      implementationStatus = snapshot.implementationStatus
      expectedUpdatedAt = snapshot.expectedUpdatedAt
      restoredClaim = snapshot.claimedByAgentId
    }
    if (captureUndo && (expectedUpdatedAt === undefined || (reviewStatus === 'rejected' && !preserveExternalWork))) return jsonError(req, res, 400, 'Reversible changes require a version and must preserve linked work')
    if (implementationStatus !== undefined && (!IMPLEMENTATION_STATUSES.includes(implementationStatus) || expectedUpdatedAt === undefined)) return jsonError(req, res, 400, 'implementationStatus requires a valid status and expectedUpdatedAt')
    if (expectedUpdatedAt !== undefined && !VERSION_TIMESTAMP.safeParse(expectedUpdatedAt).success) return jsonError(req, res, 400, 'expectedUpdatedAt must be a timestamp')

    if (!commentId) return jsonError(req, res, 400, 'Missing commentId')
    if (!reviewStatus || !VALID_STATUSES.has(reviewStatus)) {
      return jsonError(req, res, 400, 'reviewStatus must be open, accepted, or rejected')
    }

    if (!existing || !existing.projectId) return jsonError(req, res, 404, 'Comment not found')
    if (!(await requireProjectCommentCapability(req, res, user, existing, 'feedback:manage'))) return

    if (captureUndo && existing.updatedAt !== expectedUpdatedAt) return jsonError(req, res, 409, 'Feedback changed. Refresh before changing it again.')
    const signUndo = captureUndo ? prepareFeedbackUndo(user.userId, { ...existing, projectId: existing.projectId }) : null
    const comment = await mutateProjectFeedback(existing.projectId, user.userId, commentId, {
      reviewStatus, expectedUpdatedAt,
      ...(implementationStatus !== undefined ? { implementationStatus } : {}),
      ...(restoredClaim !== undefined ? { claimedByAgentId: restoredClaim } : implementationStatus === 'unassigned' ? { claimedByAgentId: null } : {}),
    })
    if (!comment) return jsonError(req, res, 404, 'Comment not found')
    if (reviewStatus === 'rejected' && !preserveExternalWork && undoToken === undefined) {
      waitUntil(closeLinkedExternalWork(existing.projectId, commentId, comment.updatedAt).catch(() => undefined))
    }
    const activeShares = await findActiveSharesForComment(commentId)
    await Promise.all(activeShares.map(async (share) => {
      await createFeedbackEvent({
      shareId: share.id,
      commentId,
      actorType: 'reviewer',
      actorId: 'reviewer',
      eventType: 'comment.reviewed',
      payload: { reviewStatus },
      })
      if (implementationStatus !== undefined) await createFeedbackEvent({
        shareId: share.id, commentId, actorType: 'reviewer', actorId: 'reviewer',
        eventType: 'comment.implementation_changed', payload: { implementationStatus },
      })
    }))

    setCors(req, res, ['PATCH', 'OPTIONS'])
    return res.status(200).json(signUndo ? { ...comment, undoToken: signUndo(comment.updatedAt) } : comment)
  } catch (error) {
    if (error instanceof Error && error.message === 'status_conflict') return jsonError(req, res, 409, 'Feedback changed after this action. Refresh before changing it again.', error)
    if (error instanceof Error && error.message === 'forbidden') return jsonError(req, res, 403, 'Forbidden', error)
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error', error)
  }
}
