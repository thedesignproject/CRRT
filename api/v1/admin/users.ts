import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSuperAdmin } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { listAllUsers } from '../../_lib/store.js'
import { AdminQueryError, parseAdminLimit } from '../../_lib/admin-pagination.js'

// Super-admin only: every auth user, newest first, with project counts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireSuperAdmin(req, res)
  if (!user) return

  try {
    const limit = parseAdminLimit(req.query.limit)
    const cursor = req.query.cursor
    if (cursor !== undefined && typeof cursor !== 'string') throw new AdminQueryError('Invalid cursor')
    const users = await listAllUsers({ limit, cursor })
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(users)
  } catch (error) {
    if (error instanceof AdminQueryError) return jsonError(req, res, 400, error.message)
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
