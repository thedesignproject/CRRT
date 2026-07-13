import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import {
  assertGitHubInstallationRepoAccess,
  verifyGitHubAppInstallationToken,
} from '../../../_lib/github-app.js'
import {
  connectGithubRepo,
  disconnectGithubRepo,
  getProjectMember,
  getRepoConfig,
  normalizeGitHubRepoUrl,
} from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

async function requireProjectAdmin(userId: string, projectKey: string) {
  const membership = await getProjectMember(userId, projectKey)
  return membership?.role === 'admin'
}

function hasAuthorizationBearer(req: VercelRequest) {
  return typeof req.headers.authorization === 'string'
    && /^Bearer\s+\S+$/.test(req.headers.authorization)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'PATCH', 'OPTIONS'])) return
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return methodNotAllowed(req, res, ['GET', 'PATCH', 'OPTIONS'])
  }

  if (req.method === 'PATCH' && !hasAuthorizationBearer(req)) {
    return jsonError(req, res, 401, 'Unauthorized')
  }

  const user = await requireUser(req, res)
  if (!user) return

  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  try {
    if (!(await requireProjectAdmin(user.userId, projectKey))) {
      return jsonError(req, res, 403, 'Admin role required')
    }

    if (req.method === 'GET') {
      const config = await getRepoConfig(projectKey)
      setCors(req, res, ['GET', 'PATCH', 'OPTIONS'])
      return res.status(200).json(config)
    }

    const body = (req.body ?? {}) as { repoUrl?: unknown, installationToken?: unknown }
    if (body.repoUrl !== null && typeof body.repoUrl !== 'string') {
      return jsonError(req, res, 400, 'repoUrl must be a verified GitHub repository or null')
    }

    if (body.repoUrl === null) {
      const config = await disconnectGithubRepo(projectKey, user.userId)
      setCors(req, res, ['GET', 'PATCH', 'OPTIONS'])
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(config)
    }

    if (typeof body.installationToken !== 'string') {
      return jsonError(req, res, 400, 'installationToken is required')
    }

    const normalized = normalizeGitHubRepoUrl(body.repoUrl)
    if (!normalized) return jsonError(req, res, 400, 'Invalid GitHub repository')

    const installation = verifyGitHubAppInstallationToken(body.installationToken)
    if (
      !installation
      || installation.projectKey !== projectKey
      || installation.userId !== user.userId
    ) {
      return jsonError(req, res, 403, 'GitHub connection could not be verified')
    }

    await assertGitHubInstallationRepoAccess(
      installation.installationId,
      normalized.githubOwner,
      normalized.githubRepo,
    )
    const config = await connectGithubRepo(
      projectKey,
      user.userId,
      normalized.repoUrl,
      installation.installationId,
      installation.expectedConnectionVersion,
    )
    setCors(req, res, ['GET', 'PATCH', 'OPTIONS'])
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(config)
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_github_repo') {
      return jsonError(req, res, 400, 'repoUrl must point to a GitHub repository')
    }
    if (error instanceof Error && error.message === 'stale_connection_attempt') {
      return jsonError(req, res, 409, 'GitHub connection attempt is stale')
    }
    if (error instanceof Error && error.message === 'github_installation_repo_inaccessible') {
      return jsonError(req, res, 403, 'GitHub connection could not be verified')
    }
    if (error instanceof Error && [
      'github_installation_token_failed',
      'github_installation_repo_lookup_failed',
    ].includes(error.message)) {
      return jsonError(req, res, 502, 'GitHub connection verification failed')
    }
    console.error('GitHub repository configuration failed')
    return jsonError(req, res, 500, 'Internal server error')
  }
}
