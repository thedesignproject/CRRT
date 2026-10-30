import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checked } from '../../../server/mcp/auth.js'
import { getServiceSupabase } from '../../_lib/supabase.js'
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'Cleanup unavailable' })
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
  try { await checked(await getServiceSupabase().rpc('mcp_cleanup')); return res.status(204).end() }
  catch { return res.status(503).json({ error: 'Cleanup unavailable' }) }
}
