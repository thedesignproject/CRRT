import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { getProjectMember, getRepoConfig, updateRepoConfig, type RepoConfigPatch } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

export const AGENT_INSTRUCTIONS_MAX = 4000

const TEXT_FIELDS = [
  { key: 'agentInstructions', max: AGENT_INSTRUCTIONS_MAX },
  { key: 'localPath', max: 400 },
  { key: 'devCommand', max: 400 },
  { key: 'testCommand', max: 400 },
] as const satisfies ReadonlyArray<{ key: keyof RepoConfigPatch; max: number }>

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

    const body = (req.body ?? {}) as Record<string, unknown>
    const patch: RepoConfigPatch = {}

    if ('repoUrl' in body) {
      if (body.repoUrl !== null && typeof body.repoUrl !== 'string') {
        return jsonError(req, res, 400, 'repoUrl must be a GitHub URL, owner/repo, or null')
      }
      patch.repoUrl = body.repoUrl as string | null
    }

    // Free-text fields: a string sets the value (trimmed at the edges only —
    // inner markdown survives verbatim; '' clears), null clears, an absent
    // key leaves the stored value untouched.
    for (const field of TEXT_FIELDS) {
      if (!(field.key in body)) continue
      const value = body[field.key]
      if (value !== null && typeof value !== 'string') {
        return jsonError(req, res, 400, `${field.key} must be a string or null`)
      }
      const trimmed = value === null ? null : (value as string).trim()
      if (trimmed !== null && trimmed.length > field.max) {
        return jsonError(req, res, 400, `${field.key} must be ${field.max} characters or fewer`)
      }
      patch[field.key] = trimmed === '' ? null : trimmed
    }

    if (Object.keys(patch).length === 0) {
      return jsonError(req, res, 400, 'No supported fields to update')
    }

    const config = await updateRepoConfig(projectKey, patch)
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
