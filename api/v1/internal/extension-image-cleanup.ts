import type { VercelRequest, VercelResponse } from '@vercel/node'
import { processExtensionImageCleanup } from '../../_lib/extension-image-cleanup.js'
import { firstHeaderValue } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'Cleanup unavailable' })
  if (firstHeaderValue(req.headers.authorization) !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' })
  try {
    await processExtensionImageCleanup()
    return res.status(204).end()
  } catch {
    return res.status(503).json({ error: 'Cleanup failed' })
  }
}
