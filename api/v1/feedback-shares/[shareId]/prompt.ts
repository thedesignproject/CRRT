import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { getAppUrl, handleOptions, jsonError, methodNotAllowed, setCors, getStringQuery } from '../../../_lib/http.js'
import { getProject, getRepoConfig, getShareById, rotateShareToken } from '../../../_lib/store.js'
import { buildPrompt } from '../../../_lib/prompts.js'
import { decryptToken, encryptToken, generateAccessToken, hashToken } from '../../../_lib/tokens.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const shareId = getStringQuery(req.query.shareId)
    const target = getStringQuery(req.query.target) || 'generic'
    if (!shareId) return jsonError(req, res, 400, 'Missing shareId')

    const share = await getShareById(shareId)
    if (!share) return jsonError(req, res, 404, 'Share not found')
    if (!(await requireProjectMembership(req, res, user, share.projectId))) return

    const project = await getProject(share.projectId)
    if (!project) return jsonError(req, res, 404, 'Project not found')

    const repoConfig = await getRepoConfig(share.projectId)

    let token: string
    try {
      token = decryptToken(share.accessTokenCiphertext)
    } catch {
      // Legacy row encrypted under an old SHARE_TOKEN_SECRET. Self-heal by
      // reissuing the token under the current secret; if the rotation itself
      // fails, the share is unrecoverable — tell the client to recreate it.
      try {
        token = generateAccessToken()
        await rotateShareToken(share.id, {
          accessTokenHash: hashToken(token),
          accessTokenCiphertext: encryptToken(token),
        })
        console.warn('[feedback-shares/prompt] rotated undecryptable share token', {
          shareId: share.id,
          projectKey: share.projectId,
        })
      } catch (rotationError) {
        console.error('[feedback-shares/prompt] share token rotation failed', {
          shareId: share.id,
          projectKey: share.projectId,
          error: rotationError,
        })
        return jsonError(req, res, 410, 'This share link could not be refreshed — please create a new share.')
      }
    }

    const base = getAppUrl(req)
    const prompt = buildPrompt(target, {
      appUrl: base,
      slug: share.slug,
      token,
      pageUrl: share.scopePageUrl,
      projectKey: project.publicKey,
      projectName: project.name,
      repoConfig,
    })

    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({
      shareId: share.id,
      target,
      prompt,
      tokenUrl: `${base}/api/v1/agent/shares/${share.slug}/state?token=${encodeURIComponent(token)}`,
    })
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
