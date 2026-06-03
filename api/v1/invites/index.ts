import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { listInvitesForEmail } from '../../_lib/store.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const invites = await listInvitesForEmail(user.email)
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(invites)
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
