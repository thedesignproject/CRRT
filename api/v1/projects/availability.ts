import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { isValidProjectKey, suggestAvailableProjectKey } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  const key = (getStringQuery(req.query.key) ?? '').trim().toLowerCase()
  if (!isValidProjectKey(key)) return jsonError(req, res, 400, 'Invalid project key')

  try {
    const suggestion = await suggestAvailableProjectKey(key)
    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json({ key, available: suggestion === key, suggestion })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
