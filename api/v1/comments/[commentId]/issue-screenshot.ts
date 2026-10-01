import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed } from '../../../_lib/http.js'
import { verifyIssueScreenshotToken } from '../../../_lib/issue-screenshot.js'
import { getServiceSupabase } from '../../../_lib/supabase.js'

// Explicit GitHub export delegates access to this screenshot only. The durable
// capability is bound to its storage path and stops working if the link or
// comment is removed. Ordinary widget reads retain five-minute signed URLs.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const id = getStringQuery(req.query.commentId)
  const token = getStringQuery(req.query.token)
  if (!id || !token) return jsonError(req, res, 404, 'Screenshot not found')
  try {
    const db = getServiceSupabase()
    const { data, error } = await db.from('comments').select('id,project_id,screenshot_storage_path,github_issue_url').eq('id', id).maybeSingle()
    if (error) throw new Error('Screenshot lookup failed')
    if (!data?.screenshot_storage_path || !data.github_issue_url || !verifyIssueScreenshotToken(token, data.project_id, data.id, data.screenshot_storage_path)) return jsonError(req, res, 404, 'Screenshot not found')
    const signed = await db.storage.from('extension-feedback-images').createSignedUrl(data.screenshot_storage_path, 300)
    if (signed.error) throw new Error('Screenshot signing failed')
    res.setHeader('Location', signed.data.signedUrl)
    return res.status(302).end()
  } catch {
    return jsonError(req, res, 500, 'Could not load screenshot')
  }
}
