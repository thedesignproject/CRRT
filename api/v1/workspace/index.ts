import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { getWorkspaceName, setWorkspaceName } from '../../_lib/store.js'

const METHODS = ['GET', 'PUT', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return

  try {
    let name: string | null
    if (req.method === 'PUT') {
      name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      if (!name || name.length > 60) return jsonError(req, res, 400, 'Workspace name must be 1 to 60 characters')
      await setWorkspaceName(user.userId, name)
    } else {
      name = await getWorkspaceName(user.userId)
    }
    setCors(req, res, METHODS)
    return res.status(200).json({ name })
  } catch (error) {
    console.error('Workspace update failed', error)
    return jsonError(req, res, 500, 'Unable to load or update the workspace')
  }
}
