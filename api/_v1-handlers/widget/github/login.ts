import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRepoConfig } from '../../../_lib/store.js'
import { buildGitHubAuthorizeUrl, createWidgetGithubState } from '../../../_lib/widget-github-auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed } from '../../../_lib/http.js'

function parseOrigin(value: string | undefined) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const projectKey = getStringQuery(req.query.projectKey)
  const origin = parseOrigin(getStringQuery(req.query.origin))
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectKey')
  if (!origin) return jsonError(req, res, 400, 'Missing or invalid origin')

  try {
    const config = await getRepoConfig(projectKey)
    if (!config?.githubOwner || !config.githubRepo) {
      return jsonError(req, res, 409, 'GitHub repo is not configured')
    }

    const state = createWidgetGithubState({ projectKey, origin })
    res.setHeader('Location', buildGitHubAuthorizeUrl(state))
    return res.status(302).end()
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
