import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { deleteInvite, findInvitesForEmail, insertProjectMembership } from '../../_lib/store.js'

const METHODS = ['POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)

  const user = await requireUser(req, res)
  if (!user) return

  try {
    const invites = await findInvitesForEmail(user.email)
    for (const invite of invites) {
      await insertProjectMembership({
        projectKey: invite.projectKey,
        userId: user.userId,
        role: invite.role,
      })
      await deleteInvite(invite.projectKey, invite.email)
    }
    setCors(req, res, METHODS)
    return res.status(200).json({ redeemed: invites.length })
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
