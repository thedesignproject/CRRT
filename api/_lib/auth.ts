import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBearerToken, getReviewerToken, jsonError } from './http.js'
import { getProjectMembership, type ProjectRole } from './store.js'
import { getSupabase } from './supabase.js'

export type AuthenticatedUser = { userId: string; email: string }

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

export async function requireProjectMembership(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  projectKey: string,
): Promise<ProjectRole | null> {
  const role = await getProjectMembership(userId, projectKey)
  if (!role) {
    jsonError(req, res, 403, 'Forbidden')
    return null
  }
  return role
}

export async function requireProjectAdmin(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  projectKey: string,
): Promise<boolean> {
  const role = await requireProjectMembership(req, res, userId, projectKey)
  if (!role) return false
  if (role !== 'admin') {
    jsonError(req, res, 403, 'Admin required')
    return false
  }
  return true
}
