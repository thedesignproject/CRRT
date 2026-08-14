import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSuperAdmin } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import {
  ADMIN_PROJECT_SORTS,
  listProjectsWithComments,
  type AdminProjectSort,
  type AdminSortDirection,
} from '../../_lib/store.js'
import { AdminQueryError, parseAdminLimit } from '../../_lib/admin-pagination.js'

// Super-admin only: every project that has received a comment, ordered by most
// recent comment, with counts, claim state, and owner emails.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireSuperAdmin(req, res)
  if (!user) return

  try {
    const limit = parseAdminLimit(req.query.limit)
    const cursor = req.query.cursor
    const sort = req.query.sort ?? 'lastCommentAt'
    const direction = req.query.direction ?? 'desc'
    if (cursor !== undefined && typeof cursor !== 'string') throw new AdminQueryError('Invalid cursor')
    if (typeof sort !== 'string' || !ADMIN_PROJECT_SORTS.includes(sort as AdminProjectSort)) {
      throw new AdminQueryError('Invalid sort')
    }
    if (direction !== 'asc' && direction !== 'desc') throw new AdminQueryError('Invalid direction')
    const projects = await listProjectsWithComments({
      limit, cursor, sort: sort as AdminProjectSort, direction: direction as AdminSortDirection,
    })
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(projects)
  } catch (error) {
    if (error instanceof AdminQueryError) return jsonError(req, res, 400, error.message)
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
