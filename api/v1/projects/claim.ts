import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import {
  countProjectAdmins,
  createProject,
  deleteInvite,
  findInvite,
  getProject,
  insertProjectMembership,
  type ProjectRole,
} from '../../_lib/store.js'

const METHODS = ['POST', 'OPTIONS']

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)

  const user = await requireUser(req, res)
  if (!user) return

  const body = (req.body ?? {}) as { projectKey?: unknown }
  const rawKey = typeof body.projectKey === 'string' ? body.projectKey.trim().toLowerCase() : ''
  if (!rawKey) return jsonError(req, res, 400, 'Missing projectKey')
  if (!KEY_PATTERN.test(rawKey)) {
    return jsonError(req, res, 400, 'projectKey must be lowercase alphanumeric + hyphens (max 60 chars)')
  }

  try {
    const existing = await getProject(rawKey)

    if (!existing) {
      const project = await createProject({ name: rawKey, publicKey: rawKey, userId: user.userId })
      setCors(req, res, METHODS)
      return res.status(201).json({ project, role: 'admin', created: true })
    }

    if (existing.claimable) {
      const adminCount = await countProjectAdmins(rawKey)
      const role: ProjectRole = adminCount === 0 ? 'admin' : 'member'
      await insertProjectMembership({ projectKey: rawKey, userId: user.userId, role })
      setCors(req, res, METHODS)
      return res.status(200).json({ project: existing, role, created: false })
    }

    const invite = await findInvite(rawKey, user.email)
    if (!invite) return jsonError(req, res, 403, 'Project is invite-only')

    await insertProjectMembership({ projectKey: rawKey, userId: user.userId, role: invite.role })
    await deleteInvite(rawKey, user.email)
    setCors(req, res, METHODS)
    return res.status(200).json({ project: existing, role: invite.role, created: false })
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
