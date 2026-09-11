import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleanupExtensionAuthHandoffs } from '../../../_lib/extension-auth-store.js'
import { firstHeaderValue } from '../../../_lib/http.js'
import { extensionJsonError, setExtensionNoStore } from '../../../_lib/extension-auth-http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setExtensionNoStore(res)
  if (req.method !== 'GET') return extensionJsonError(res, 405, 'Method not allowed')
  const secret = process.env.CRON_SECRET
  if (!secret) return extensionJsonError(res, 500, 'Cleanup unavailable')
  if (firstHeaderValue(req.headers.authorization) !== `Bearer ${secret}`) {
    return extensionJsonError(res, 401, 'Unauthorized')
  }
  try {
    await cleanupExtensionAuthHandoffs()
    return res.status(204).end()
  } catch {
    return extensionJsonError(res, 500, 'Cleanup failed')
  }
}
