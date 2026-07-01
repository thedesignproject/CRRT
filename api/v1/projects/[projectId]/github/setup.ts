import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createGitHubAppSetupAuthState,
  verifyGitHubAppInstallState,
} from '../../../../_lib/github-app.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'
import { buildGitHubAuthorizeUrl } from '../../../../_lib/widget-github-auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const projectKey = getStringQuery(req.query.projectId)
  const installationId = getStringQuery(req.query.installation_id)
  const installState = getStringQuery(req.query.state)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  if (!installationId) return jsonError(req, res, 400, 'Missing installationId')
  if (!installState) return jsonError(req, res, 400, 'Missing installState')

  try {
    const verifiedState = verifyGitHubAppInstallState(installState)
    if (!verifiedState || verifiedState.projectKey !== projectKey) {
      return jsonError(req, res, 403, 'Invalid install state')
    }

    const setupAuthState = createGitHubAppSetupAuthState({
      projectKey,
      userId: verifiedState.userId,
      origin: verifiedState.origin,
      installationId,
    })
    const authorizeUrl = buildGitHubAuthorizeUrl(setupAuthState)
    setCors(req, res, ['GET', 'OPTIONS'])
    res.setHeader('Location', authorizeUrl)
    return res.status(302).end()
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
