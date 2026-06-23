import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../../_lib/auth.js'
import { buildGitHubAppInstallUrl } from '../../../../_lib/github-app.js'
import { getProjectMember } from '../../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

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

    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({ installUrl: buildGitHubAppInstallUrl() })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
