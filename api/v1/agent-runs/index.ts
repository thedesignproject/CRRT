import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { listAgentRuns, listProjectsForUser } from '../../_lib/store.js'

const METHODS = ['GET', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const limit = Number(getStringQuery(req.query.limit) ?? '50')
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return jsonError(req, res, 400, 'limit must be an integer from 1 to 200')
  const projectKey = getStringQuery(req.query.project)
  if (projectKey && !(await requireProjectCapability(req, res, user, projectKey, 'agent:operate'))) return

  try {
    const projectKeys = projectKey ? [projectKey]
      : (await listProjectsForUser(user.userId)).filter((project) => project.capabilities.includes('agent:operate')).map((project) => project.publicKey)
    const runs = await listAgentRuns(projectKeys, limit)
    setCors(req, res, METHODS)
    return res.status(200).json({ runs })
  } catch (error) {
    console.error('Agent runs request failed', error)
    return jsonError(req, res, 500, 'Unable to load agent runs')
  }
}
