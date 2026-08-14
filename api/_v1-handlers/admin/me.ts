import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isSuperAdmin, requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

// Reports whether the authenticated caller is a super admin. Returns 200 with
// `{ isSuperAdmin: false }` for ordinary users (rather than 403) so the
// dashboard can decide whether to surface the Super Admin UI — the real gate is
// `requireSuperAdmin` on the data endpoints.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const superAdmin = await isSuperAdmin(user.userId)
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({ isSuperAdmin: superAdmin })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
