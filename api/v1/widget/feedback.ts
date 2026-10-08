import { waitUntil } from '@vercel/functions'
import { closeLinkedExternalWork } from '../../_lib/external-work-sync.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { createFeedbackEvent, findActiveSharesForComment, mutateWidgetFeedbackBatch } from '../../_lib/store.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../_lib/widget-session.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  try {
    const session = await requireWidgetSession(req)
    const body = (req.body ?? {}) as Record<string, unknown>
    const projectKey = typeof body.projectKey === 'string' ? body.projectKey : ''
    const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl : ''
    const action = body.action
    const commentIds = Array.isArray(body.commentIds) ? body.commentIds : []
    if (!projectKey || !pageUrl || !['accept', 'reject', 'resolve'].includes(String(action))
      || commentIds.length < 1 || commentIds.length > 100
      || !commentIds.every((id): id is string => typeof id === 'string' && UUID.test(id))
      || new Set(commentIds).size !== commentIds.length) {
      return jsonError(req, res, 400, 'Invalid feedback action')
    }
    assertWidgetPage(session, projectKey, pageUrl)
    const comments = await mutateWidgetFeedbackBatch({
      projectKey,
      actorUserId: session.user_id,
      pageUrl,
      commentIds,
      action: action as 'accept' | 'reject' | 'resolve',
    })
    await Promise.all(comments.map(async (comment) => {
      if (action === 'reject') {
        waitUntil(closeLinkedExternalWork(projectKey, comment.id, comment.updatedAt).catch(() => undefined))
      }
      const shares = await findActiveSharesForComment(comment.id)
      await Promise.all(shares.map((share) => createFeedbackEvent({
        shareId: share.id,
        commentId: comment.id,
        actorType: 'reviewer',
        actorId: 'reviewer',
        eventType: action === 'resolve' ? 'comment.implementation_changed' : 'comment.reviewed',
        payload: action === 'resolve'
          ? { implementationStatus: comment.implementationStatus }
          : { reviewStatus: comment.reviewStatus },
      })))
    }))
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ comments })
  } catch (error) {
    if (error instanceof WidgetSessionError) return jsonError(req, res, error.status, error.message)
    const message = error instanceof Error ? error.message : ''
    if (message.includes('invalid_selection')) return jsonError(req, res, 409, 'Feedback changed. Refresh and retry.')
    if (message.includes('forbidden')) return jsonError(req, res, 403, 'Agent is unavailable for this project')
    console.error('[widget/feedback] mutation failed', { projectKey: getStringQuery(req.query.projectKey), error })
    return jsonError(req, res, 500, 'Could not update feedback')
  }
}
