import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { createDefaultCommentIssueContent } from '../../../_lib/comment-issue-content.js'
import { formatGithubIssueBody } from '../../../_lib/github-issues.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { getComment, getCommentForGithubIssue, getGithubIssueConnection } from '../../../_lib/store.js'
import githubIssueHandler from './github-issue.js'

const METHODS = ['GET', 'POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const provider = req.method === 'GET' ? getStringQuery(req.query.provider) : req.body?.provider
  if (provider !== 'github') return jsonError(req, res, 400, 'unsupported_external_work_provider')
  if (req.method === 'POST') return githubIssueHandler(req, res)

  const user = await requireUser(req, res)
  if (!user) return
  const commentId = getStringQuery(req.query.commentId)
  if (!commentId) return jsonError(req, res, 400, 'Missing commentId')

  try {
    const publicComment = await getComment(commentId)
    if (!publicComment?.projectId) return jsonError(req, res, 404, 'Comment not found')
    if (!(await requireProjectCommentCapability(req, res, user, publicComment, 'integrations:send'))) return
    const comment = await getCommentForGithubIssue(publicComment.projectId, commentId)
    if (!comment) return jsonError(req, res, 404, 'Comment not found')
    const connection = await getGithubIssueConnection(publicComment.projectId)
    const content = createDefaultCommentIssueContent(comment)
    setCors(req, res, METHODS)
    return res.status(200).json({
      provider: 'github',
      connected: Boolean(connection),
      destination: connection ? `${connection.owner}/${connection.repo}` : null,
      existing: comment.githubIssue ?? null,
      draft: {
        title: content.title,
        body: formatGithubIssueBody(comment, content, '').trim(),
      },
    })
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Could not prepare external work')
  }
}
