import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, getRepoConfig, updateRepoConfig } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

async function requireProjectAdmin(userId: string, projectKey: string) {
  const membership = await getProjectMember(userId, projectKey)
  return membership?.role === 'admin'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'PATCH', 'OPTIONS'])) return
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return methodNotAllowed(req, res, ['GET', 'PATCH', 'OPTIONS'])
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

    const body = (req.body ?? {}) as { repoUrl?: unknown }
    if (body.repoUrl !== null && typeof body.repoUrl !== 'string') {
      return jsonError(req, res, 400, 'repoUrl must be a GitHub URL, owner/repo, or null')
    }

    const config = await updateRepoConfig(projectKey, { repoUrl: body.repoUrl })
    setCors(req, res, ['GET', 'PATCH', 'OPTIONS'])
    return res.status(200).json(config)
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_github_repo') {
      return jsonError(req, res, 400, 'repoUrl must point to a GitHub repository')
    }
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
