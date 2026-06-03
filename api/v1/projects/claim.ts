import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { claimProject } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  const body = (req.body ?? {}) as { projectKey?: unknown; name?: unknown }
  const projectKey = typeof body.projectKey === 'string' ? body.projectKey.trim() : ''
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectKey')
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  if (rawName.length > 80) return jsonError(req, res, 400, 'Project name too long')
  const name = rawName || undefined

  try {
    const project = await claimProject(user.userId, projectKey, name)
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json(project)
  } catch (error) {
    const msg = error instanceof Error ? error.message : undefined
    if (msg === 'not_found') return jsonError(req, res, 404, 'Project not found')
    if (msg === 'already_claimed') return jsonError(req, res, 409, 'Project already claimed')
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
