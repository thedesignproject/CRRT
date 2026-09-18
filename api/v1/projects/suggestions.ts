import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { suggestDomainProjects } from '../../_lib/domain-access.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

const METHODS = ['GET', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  try {
    const suggestions = await suggestDomainProjects(user.userId)
    setCors(req, res, METHODS)
    return res.status(200).json(suggestions)
  } catch (error) {
    console.error('Project suggestions failed', error)
    return jsonError(req, res, 500, 'Unable to load suggested projects')
  }
}
