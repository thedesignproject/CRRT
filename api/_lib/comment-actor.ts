import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser, type AuthenticatedUser } from './auth.js'
import { jsonError } from './http.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from './widget-session.js'

type CommentScope = { projectId: string; pageUrl: string | null }

/**
 * Authenticates dashboard/extension callers with their normal user token and
 * embedded-widget callers with the short-lived, origin-bound widget session.
 */
export async function requireCommentActor(
  req: VercelRequest,
  res: VercelResponse,
  comment: CommentScope,
): Promise<AuthenticatedUser | null> {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer crrt_widget_')) {
    return requireUser(req, res)
  }

  try {
    const session = await requireWidgetSession(req)
    if (!comment.pageUrl) throw new WidgetSessionError(403, 'Widget session does not allow this feedback')
    assertWidgetPage(session, comment.projectId, comment.pageUrl)
    return { userId: session.user_id, email: '' }
  } catch (error) {
    if (error instanceof WidgetSessionError) {
      jsonError(req, res, error.status, error.message)
      return null
    }
    jsonError(req, res, 500, 'Widget authentication failed')
    return null
  }
}
