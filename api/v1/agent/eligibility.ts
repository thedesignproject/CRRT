import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRepoConfig } from '../../_lib/store.js'
import { verifyWidgetAuthToken } from '../../_lib/widget-github-auth.js'
import { getAppUrl, getBearerToken, getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

function buildLoginUrl(req: VercelRequest, projectKey: string) {
  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
  const origin = originHeader || getStringQuery(req.query.origin) || getAppUrl(req)
  const url = new URL(`${getAppUrl(req)}/api/v1/widget/github/login`)
  url.searchParams.set('projectKey', projectKey)
  url.searchParams.set('origin', origin)
  return url.toString()
}

function unauthenticated(req: VercelRequest, projectKey: string, reason = 'login_required') {
  return {
    canRequest: false,
    mustLogin: true,
    mustSignUp: true,
    isProjectMember: false,
    reason,
    loginUrl: buildLoginUrl(req, projectKey),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const projectKey = getStringQuery(req.query.project_id)
  if (!projectKey) return jsonError(req, res, 400, 'Missing project_id')

  try {
    const config = await getRepoConfig(projectKey)
    if (!config?.githubOwner || !config.githubRepo) {
      setCors(req, res, ['GET', 'OPTIONS'])
      return res.status(200).json({
        canRequest: false,
        mustLogin: false,
        mustSignUp: false,
        isProjectMember: false,
        reason: 'repo_not_configured',
      })
    }

    const token = getBearerToken(req)
    if (!token) {
      setCors(req, res, ['GET', 'OPTIONS'])
      return res.status(200).json(unauthenticated(req, projectKey))
    }

    const payload = verifyWidgetAuthToken(token)
    const matchesRepo = payload?.projectKey === projectKey
      && payload.githubOwner === config.githubOwner
      && payload.githubRepo === config.githubRepo
    if (!payload || !matchesRepo) {
      setCors(req, res, ['GET', 'OPTIONS'])
      return res.status(200).json(unauthenticated(req, projectKey, 'invalid_token'))
    }

    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({
      canRequest: true,
      mustLogin: false,
      mustSignUp: false,
      isProjectMember: true,
      githubLogin: payload.githubLogin,
    })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
