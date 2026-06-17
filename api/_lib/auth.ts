import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBearerToken, getReviewerToken, jsonError } from './http.js'
import { isProjectMember } from './store.js'
import { getServiceSupabase, getSupabase } from './supabase.js'

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

/**
 * True when the user is in the global `super_admins` allowlist. Reads through
 * the service-role client since `super_admins` is RLS deny-all like every other
 * table. A query error throws so callers fail closed rather than silently
 * granting/denying.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await getServiceSupabase()
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

/**
 * Gate for the `/api/v1/admin/*` endpoints. Authenticates the caller, then
 * requires super-admin membership. Writes 403 on miss so callers can
 * `const user = await requireSuperAdmin(...); if (!user) return`.
 */
export async function requireSuperAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthenticatedUser | null> {
  const user = await requireUser(req, res)
  if (!user) return null

  try {
    if (await isSuperAdmin(user.userId)) return user
  } catch {
    jsonError(req, res, 500, 'Super admin check failed')
    return null
  }
  jsonError(req, res, 403, 'Forbidden')
  return null
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
