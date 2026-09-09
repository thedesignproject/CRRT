import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { createDefaultCommentIssueContent } from '../../../_lib/comment-issue-content.js'
import { formatGithubIssueBody } from '../../../_lib/github-issues.js'
import { getLinearAccessToken } from '../../../_lib/linear-connection.js'
import { createLinearIssue } from '../../../_lib/linear.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import {
  claimCommentExternalWork,
  finalizeCommentExternalWork,
  getComment,
  getCommentExternalWork,
  getCommentForGithubIssue,
  getGithubIssueConnection,
  getProjectIntegration,
  markCommentExternalWorkUncertain,
  releaseCommentExternalWork,
  updateReviewStatus,
} from '../../../_lib/store.js'
import githubIssueHandler from './github-issue.js'

const METHODS = ['GET', 'POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const provider = req.method === 'GET' ? getStringQuery(req.query.provider) : req.body?.provider
  if (provider !== 'github' && provider !== 'linear') return jsonError(req, res, 400, 'unsupported_external_work_provider')
  if (req.method === 'POST' && provider === 'github') return githubIssueHandler(req, res)

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
    const content = createDefaultCommentIssueContent(comment)
    if (provider === 'linear') {
      const existing = await getCommentExternalWork(commentId, 'linear')
      const integration = await getProjectIntegration(publicComment.projectId, 'linear')
      if (req.method === 'GET') {
        setCors(req, res, METHODS)
        return res.status(200).json({
          provider,
          connected: Boolean(integration?.containerId),
          destination: integration?.containerName ?? null,
          existing: existing?.state === 'created' ? {
            externalId: existing.externalId,
            externalKey: existing.externalKey,
            externalUrl: existing.externalUrl,
            createdAt: existing.createdAt,
          } : null,
          draft: { title: content.title, body: formatGithubIssueBody(comment, content, '').trim() },
        })
      }
      if (comment.reviewStatus === 'rejected') return jsonError(req, res, 409, 'comment_rejected')
      if (existing?.state === 'created' && existing.externalUrl) {
        if (comment.reviewStatus === 'open') await updateReviewStatus(publicComment.projectId, commentId, 'accepted')
        setCors(req, res, METHODS)
        return res.status(200).json({
          externalId: existing.externalId,
          externalKey: existing.externalKey,
          externalUrl: existing.externalUrl,
          createdAt: existing.createdAt,
          created: false,
        })
      }
      if (!integration?.containerId) return jsonError(req, res, 409, 'linear_not_connected')
      const draft = req.body?.draft
      const title = typeof draft?.title === 'string' ? draft.title.trim() : ''
      const body = typeof draft?.body === 'string' ? draft.body.trim() : ''
      if (!title || !body) return jsonError(req, res, 400, 'invalid_external_work_draft')

      const leaseToken = randomUUID()
      const claim = await claimCommentExternalWork({
        projectId: publicComment.projectId, commentId, provider: 'linear', leaseToken,
      })
      if (claim?.state === 'created' && claim.externalUrl) {
        setCors(req, res, METHODS)
        return res.status(200).json({
          externalId: claim.externalId,
          externalKey: claim.externalKey,
          externalUrl: claim.externalUrl,
          createdAt: claim.createdAt,
          created: false,
        })
      }
      if (!claim || claim.leaseToken !== leaseToken) {
        return jsonError(req, res, 409, claim?.uncertainAt ? 'linear_issue_recovery_pending' : 'linear_issue_creation_in_progress')
      }
      try {
        const accessToken = await getLinearAccessToken(integration)
        if (!(await requireProjectCapability(req, res, user, publicComment.projectId, 'integrations:send'))) {
          await releaseCommentExternalWork(claim.id, leaseToken)
          return
        }
        if (!(await markCommentExternalWorkUncertain(claim.id, leaseToken))) throw new Error('linear_issue_creation_in_progress')
        const result = await createLinearIssue(accessToken, { teamId: integration.containerId, title, description: body })
        const finalized = await finalizeCommentExternalWork({ id: claim.id, leaseToken, ...result })
        if (!finalized) throw new Error('linear_issue_persistence_failed')
        await updateReviewStatus(publicComment.projectId, commentId, 'accepted')
        setCors(req, res, METHODS)
        return res.status(201).json({ ...result, createdAt: finalized.createdAt, created: true })
      } catch (error) {
        if (error instanceof Error && ['linear_request_failed', 'linear_issue_create_failed'].includes(error.message)) {
          await releaseCommentExternalWork(claim.id, leaseToken)
        }
        throw error
      }
    }

    const connection = await getGithubIssueConnection(publicComment.projectId)
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
    const code = error instanceof Error ? error.message : ''
    const status = code.includes('recovery_pending') || code.includes('creation_in_progress')
      ? 409
      : code.startsWith('linear_') ? 502 : 500
    if (status === 500) console.error(error)
    return jsonError(req, res, status, req.method === 'POST' ? 'External issue creation failed' : 'Could not prepare external work')
  }
}
