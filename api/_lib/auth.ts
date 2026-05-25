import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBearerToken, getReviewerToken, jsonError } from './http.js'
import { isProjectMember } from './store.js'
import { getSupabase } from './supabase.js'

export type AuthenticatedUser = { userId: string; email: string }

/**
 * Membership gate for any endpoint that operates within a single project's
 * scope. Caller has already passed `requireUser`; this checks the user is in
 * `project_members` for the given key. Writes 403 on miss so callers can
 * `if (!(await requireProjectMembership(...))) return`.
 */
export async function requireProjectMembership(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthenticatedUser,
  projectKey: string,
): Promise<boolean> {
  try {
    if (await isProjectMember(user.userId, projectKey)) return true
  } catch {
    jsonError(req, res, 500, 'Membership check failed')
    return false
  }
  jsonError(req, res, 403, 'Forbidden')
  return false
}

export function requireReviewer(req: VercelRequest, res: VercelResponse) {
  const configured = process.env.REVIEWER_API_TOKEN
  if (!configured) {
    jsonError(req, res, 500, 'Server misconfigured: missing REVIEWER_API_TOKEN')
    return false
  }

  const presented = getReviewerToken(req)
  if (!presented || presented !== configured) {
    jsonError(req, res, 401, 'Unauthorized')
    return false
  }

  return true
}

export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(req)
  if (!token) {
    jsonError(req, res, 401, 'Unauthorized')
    return null
  }

  try {
    const { data, error } = await getSupabase().auth.getUser(token)
    if (error || !data?.user || !data.user.email) {
      jsonError(req, res, 401, 'Unauthorized')
      return null
    }
    return { userId: data.user.id, email: data.user.email }
  } catch {
    jsonError(req, res, 401, 'Unauthorized')
    return null
  }
}
