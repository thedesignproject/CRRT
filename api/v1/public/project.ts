import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createShare, getProject, getProjectShare, rotateShareToken } from '../../_lib/store.js'
import { encryptToken, generateAccessToken, generateSlug, hashToken } from '../../_lib/tokens.js'
import { decryptToken } from '../../_lib/tokens.js'
import { getAppUrl, getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  try {
    const projectKey = getStringQuery(req.query.projectKey)
    if (!projectKey) return jsonError(req, res, 400, 'Missing projectKey')

    const project = await getProject(projectKey)
    if (!project) return jsonError(req, res, 404, 'Project not found')

    let share = await getProjectShare(projectKey)
    let token: string

    if (share) {
      try {
        token = decryptToken(share.accessTokenCiphertext)
      } catch {
        // Legacy row encrypted under an old SHARE_TOKEN_SECRET. Self-heal:
        // reissue the token under the current secret instead of failing the
        // project session forever.
        const freshToken = generateAccessToken()
        const rotatedShare = await rotateShareToken(
          share.id,
          {
            accessTokenHash: share.accessTokenHash,
            accessTokenCiphertext: share.accessTokenCiphertext,
          },
          {
            accessTokenHash: hashToken(freshToken),
            accessTokenCiphertext: encryptToken(freshToken),
          },
        )
        if (rotatedShare) {
          token = freshToken
          console.warn('[public/project] rotated undecryptable share token', {
            shareId: share.id,
            projectKey,
          })
        } else {
          // Another request won the rotation race. Re-read its credentials so
          // this response returns the token that is still valid in the store.
          share = await getProjectShare(projectKey)
          if (!share) throw new Error('Share disappeared during token rotation')
          token = decryptToken(share.accessTokenCiphertext)
        }
      }
    } else {
      token = generateAccessToken()
      const slug = generateSlug()
      const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
      share = await createShare({
        projectKey,
        scopeType: 'project',
        scopePageUrl: null,
        slug,
        accessTokenHash: hashToken(token),
        accessTokenCiphertext: encryptToken(token),
        createdBy: 'system',
        expiresAt,
      })
    }

    const base = getAppUrl(req)
    const docUrl = `${base}/?fw_share=${encodeURIComponent(share.slug)}&token=${encodeURIComponent(token)}`

    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({
      projectKey: project.publicKey,
      projectName: project.name,
      doc: {
        slug: share.slug,
        token,
        docUrl,
        promptUrl: `${base}/api/v1/shares/${share.slug}/prompt?token=${encodeURIComponent(token)}`,
      },
    })
  } catch (error) {
    // Never leak internal errors (e.g. raw OpenSSL messages) to the client.
    console.error('[public/project] session start failed', {
      projectKey: getStringQuery(req.query.projectKey),
      error,
    })
    return jsonError(req, res, 500, 'Session could not be started — please retry.')
  }
}
