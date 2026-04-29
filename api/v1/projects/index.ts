import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireReviewer } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { createProject, listProjects } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'POST', 'OPTIONS'])) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, ['GET', 'POST', 'OPTIONS'])
  if (!requireReviewer(req, res)) return

  try {
    if (req.method === 'GET') {
      const projects = await listProjects()
      setCors(req, res, ['GET', 'POST', 'OPTIONS'])
      return res.status(200).json(projects)
    }

    const body = (req.body ?? {}) as { name?: unknown }
    const rawName = typeof body.name === 'string' ? body.name.trim() : ''
    if (!rawName) return jsonError(req, res, 400, 'Missing name')
    if (rawName.length > 80) return jsonError(req, res, 400, 'Name too long')

    const project = await createProject({ name: rawName })
    setCors(req, res, ['GET', 'POST', 'OPTIONS'])
    return res.status(201).json(project)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
