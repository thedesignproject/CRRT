import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { listProjectComments } from '../../../_lib/store.js'
import { IMPLEMENTATION_STATUSES, type ImplementationStatus, type ReviewStatus } from '../../../_lib/status.js'

const REVIEW_STATUSES = new Set<ReviewStatus>(['open', 'accepted', 'rejected'])
const VALID_IMPLEMENTATION_STATUSES = new Set<ImplementationStatus>(IMPLEMENTATION_STATUSES)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const projectId = getStringQuery(req.query.projectId)
    if (!projectId) return jsonError(req, res, 400, 'Missing projectId')
    const access = await requireProjectCapability(req, res, user, projectId, 'feedback:read')
    if (!access) return

    const pageUrl = getStringQuery(req.query.pageUrl)
    const reviewStatus = getStringQuery(req.query.reviewStatus)
    const implementationStatus = getStringQuery(req.query.implementationStatus)

    if (reviewStatus && !REVIEW_STATUSES.has(reviewStatus as ReviewStatus)) {
      return jsonError(req, res, 400, 'Invalid reviewStatus')
    }

    if (implementationStatus && !VALID_IMPLEMENTATION_STATUSES.has(implementationStatus as ImplementationStatus)) {
      return jsonError(req, res, 400, 'Invalid implementationStatus')
    }

    const comments = await listProjectComments(projectId, {
      pageUrl,
      reviewStatus: reviewStatus as ReviewStatus | undefined,
      implementationStatus: implementationStatus as ImplementationStatus | undefined,
      visibility: access.role === 'guest' ? 'shared' : undefined,
      includeExternalWork: access.role !== 'guest',
    })

    setCors(req, res, ['GET', 'OPTIONS'])
    return res.status(200).json(comments)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
