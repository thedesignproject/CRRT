import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { listProjectsForUser } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const projects = await listProjectsForUser(user.userId)
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(projects)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
