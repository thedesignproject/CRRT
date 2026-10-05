import { protectProjectScreenshots } from '../../../_lib/private-project.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { normalizeAllowedDomain } from '../../../_lib/origins.js'
import { getProjectMember, updateProject } from '../../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const MAX_ALLOWED_ORIGINS = 50

function parseAllowedOrigins(value: unknown): { domains: string[] } | { error: string } {
  if (!Array.isArray(value)) return { error: 'allowedOrigins must be an array of domains' }
  if (value.length > MAX_ALLOWED_ORIGINS) return { error: `allowedOrigins is limited to ${MAX_ALLOWED_ORIGINS} domains` }

  const domains = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') return { error: 'allowedOrigins entries must be strings' }
    const domain = normalizeAllowedDomain(entry)
    if (!domain) return { error: `allowedOrigins contains an invalid domain: "${entry.trim()}"` }
    domains.add(domain)
  }
  return { domains: [...domains] }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['PATCH', 'OPTIONS'])) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, ['PATCH', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  // `projectId` is the project public_key (see sibling invites.ts note).
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')

  const body = (req.body ?? {}) as { name?: unknown; allowedOrigins?: unknown; widgetPrivate?: unknown; feedbackAccess?: unknown }
  const patch: { name?: string; allowedOrigins?: string[]; widgetPrivate?: boolean; feedbackAccess?: 'team' | 'admins' } = {}

  if (body.widgetPrivate !== undefined) {
    if (typeof body.widgetPrivate !== 'boolean') return jsonError(req, res, 400, 'widgetPrivate must be a boolean')
    patch.widgetPrivate = body.widgetPrivate
  }
  if (body.feedbackAccess !== undefined) {
    if (body.feedbackAccess !== 'team' && body.feedbackAccess !== 'admins') return jsonError(req, res, 400, 'Invalid feedback access')
    patch.feedbackAccess = body.feedbackAccess
  }
  if (body.allowedOrigins !== undefined) {
    const parsed = parseAllowedOrigins(body.allowedOrigins)
    if ('error' in parsed) return jsonError(req, res, 400, parsed.error)
    patch.allowedOrigins = parsed.domains
  }

  // Name is required whenever it is present, and also when the request
  // carries no allowedOrigins — that case is a plain rename, preserving the
  // original PATCH contract.
  if (body.name !== undefined || Object.keys(patch).length === 0) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return jsonError(req, res, 400, 'Project name is required')
    if (name.length > 80) return jsonError(req, res, 400, 'Project name must be 80 characters or fewer')
    patch.name = name
  }

  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (!membership) return jsonError(req, res, 403, 'Forbidden')
    if (membership.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    if (patch.widgetPrivate) await protectProjectScreenshots(projectKey)
    // Database triggers serialize privacy activation with comment/notification
    // writes and clean restricted notifications in the same transaction.
    const project = await updateProject(projectKey, patch, user.userId)
    if (!project) return jsonError(req, res, 404, 'Project not found')

    setCors(req, res, ['PATCH', 'OPTIONS'])
    return res.status(200).json(project)
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') return jsonError(req, res, 403, 'Admin role required')
    if (error instanceof Error && error.message === 'feedback_delivery_in_progress') return jsonError(req, res, 409, 'An activity email is being delivered. Retry saving privacy shortly.')
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
