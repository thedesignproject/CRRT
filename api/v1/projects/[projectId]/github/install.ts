import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../../_lib/auth.js'
import { buildGitHubAppInstallUrl, createGitHubAppInstallState } from '../../../../_lib/github-app.js'
import { getProjectMember } from '../../../../_lib/store.js'
import { firstHeaderValue, getAppUrl, getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

function callbackOrigin(req: VercelRequest) {
  const requestedOrigin = firstHeaderValue(req.headers.origin)
  if (requestedOrigin) {
    try {
      return new URL(requestedOrigin).origin
    } catch {
      // Fall through to the app URL below.
    }
  }
  return getAppUrl(req)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const user = await requireUser(req, res)
  if (!user) return

  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (membership?.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    const installState = createGitHubAppInstallState({
      projectKey,
      userId: user.userId,
      origin: callbackOrigin(req),
    })
    setCors(req, res, ['GET', 'OPTIONS'])
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      installUrl: buildGitHubAppInstallUrl(installState),
    })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
