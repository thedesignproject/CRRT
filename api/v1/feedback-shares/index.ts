import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../_lib/auth.js'
import { createShare, listAcceptedCommentsByIds, listAcceptedCommentsForPage } from '../../_lib/store.js'
import { generateAccessToken, generateSlug, hashToken, encryptToken } from '../../_lib/tokens.js'
import { getAppUrl, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const { projectId, scopeType, pageUrl, commentIds } = req.body ?? {}
    if (!projectId || (scopeType !== 'page' && scopeType !== 'selection')) {
      return jsonError(req, res, 400, 'scopeType must be page or selection')
    }
    if (!(await requireProjectCapability(req, res, user, projectId, 'agent:operate'))) return

    const comments = scopeType === 'page'
      ? await listAcceptedCommentsForPage(projectId, pageUrl)
      : await listAcceptedCommentsByIds(projectId, Array.isArray(commentIds) ? commentIds : [])

    if (scopeType === 'page' && !pageUrl) {
      return jsonError(req, res, 400, 'pageUrl is required for page-scoped shares')
    }

    if (comments.length === 0) {
      return jsonError(req, res, 400, 'No accepted comments matched this share request')
    }

    const token = generateAccessToken()
    const slug = generateSlug()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const share = await createShare({
      projectKey: projectId,
      scopeType,
      scopePageUrl: scopeType === 'page' ? pageUrl : null,
      slug,
      accessTokenHash: hashToken(token),
      accessTokenCiphertext: encryptToken(token),
      createdBy: 'reviewer',
      expiresAt,
    }, { actorUserId: user.userId, commentIds: comments.map(comment => comment.id) })

    const tokenUrl = `${getAppUrl(req)}/api/v1/agent/shares/${share.slug}/state?token=${encodeURIComponent(token)}`

    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(201).json({
      shareId: share.id,
      slug: share.slug,
      token,
      tokenUrl,
      expiresAt,
      commentCount: comments.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') return jsonError(req, res, 403, 'Forbidden')
    if (error instanceof Error && error.message === 'share_comments_changed') return jsonError(req, res, 409, 'Feedback changed. Retry creating the share.')
    // Never leak internal errors (e.g. raw OpenSSL messages) to the client.
    console.error('[feedback-shares] share creation failed', {
      projectKey: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
      error,
    })
    return jsonError(req, res, 500, 'Share could not be created — please retry.')
  }
}
