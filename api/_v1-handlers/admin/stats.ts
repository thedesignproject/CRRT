import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSuperAdmin } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { getAdminStats } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireSuperAdmin(req, res)
  if (!user) return

  try {
    const stats = await getAdminStats()
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(stats)
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
