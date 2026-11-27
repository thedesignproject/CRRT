import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { listNextSteps } from '../../../_lib/store.js'

const METHODS = ['GET', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  if (!(await requireProjectCapability(req, res, user, projectKey, 'agent:operate'))) return

  try {
    const steps = await listNextSteps(projectKey)
    setCors(req, res, METHODS)
    return res.status(200).json({ steps })
  } catch (error) {
    console.error('Next steps request failed', error)
    return jsonError(req, res, 500, 'Unable to load next steps')
  }
}
