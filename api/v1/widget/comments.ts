import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed } from '../../_lib/http.js'
import { requireWidgetSession, assertWidgetPage, WidgetSessionError } from '../../_lib/widget-session.js'
import { getServiceSupabase } from '../../_lib/supabase.js'
import { listComments } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (handleOptions(req, res, ['GET', 'PATCH', 'DELETE', 'OPTIONS'])) return
  try {
    const session = await requireWidgetSession(req)
    if (req.method === 'GET') {
      const comments = await listComments(session.project_key, { userId: session.user_id })
      return res.status(200).json(comments.filter((comment) => {
        try { return new URL(comment.pageUrl!).origin === session.origin } catch { return false }
      }))
    }
    if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed(req, res, ['GET', 'PATCH', 'DELETE', 'OPTIONS'])
    const id = getStringQuery(req.query.id)
    if (!id) return jsonError(req, res, 400, 'Missing comment id')
    const scoped = () => getServiceSupabase().from('comments')
    const { data, error } = await scoped().select('url').eq('id', id)
      .eq('project_id', session.project_key).eq('created_by_user_id', session.user_id)
      .eq('source', 'widget').eq('visibility', 'shared').maybeSingle()
    if (error) throw new Error('Comment lookup failed')
    if (!data) return jsonError(req, res, 404, 'Comment not found')
    assertWidgetPage(session, session.project_key, data.url)
    const body = req.body?.body
    if (req.method === 'PATCH' && (typeof body !== 'string' || !body.trim() || body.length > 8000)) {
      return jsonError(req, res, 400, 'Comment must be between 1 and 8000 characters')
    }
    const mutation = req.method === 'DELETE' ? scoped().delete() : scoped().update({ comment: body.trim(), updated_at: new Date().toISOString() })
    const result = await mutation.eq('id', id).eq('project_id', session.project_key)
      .eq('created_by_user_id', session.user_id).eq('url', data.url).eq('source', 'widget').eq('visibility', 'shared')
      .select('id').maybeSingle()
    if (result.error) throw new Error('Comment update failed')
    if (!result.data) return jsonError(req, res, 404, 'Comment not found')
    return res.status(204).end()
  } catch (error) {
    return jsonError(req, res, error instanceof WidgetSessionError ? error.status : 500,
      error instanceof WidgetSessionError ? error.message : 'Could not load or update feedback')
  }
}
