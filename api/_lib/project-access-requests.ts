import { getServiceSupabase } from './supabase.js'

export type AccessRequest = {
  id: string
  project_key: string
  user_id: string
  email: string
  status: 'pending' | 'approved' | 'declined'
  attempt: number
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  granted_role: 'admin' | 'member' | 'guest' | null
}
export type AccessResult = { outcome: string; request?: AccessRequest }
export const accessErrors: Record<string, [number, string]> = {
  unverified: [403, 'Verify your email before requesting access'],
  ineligible: [403, 'Your email domain is no longer eligible for this project'],
  already_has_access: [409, 'You already belong to this project or have an invitation'],
  cooldown: [409, 'You can request access again seven days after denial'],
  forbidden: [403, 'Project admin access required'],
  not_found: [404, 'Access request not found'],
  stale: [409, 'This request has changed; refresh before reviewing'],
  resolved: [409, 'This request has already been reviewed'],
  invalid: [400, 'Invalid access decision or role'],
}

export async function listAccessRequests(project: string): Promise<AccessRequest[]> {
  const { data, error } = await getServiceSupabase().from('project_access_requests')
    .select('*').eq('project_key', project).eq('status', 'pending').order('requested_at')
  if (error) throw new Error(error.message)
  return data!
}
export async function submitAccessRequest(project: string, userId: string): Promise<AccessResult> {
  const { data, error } = await getServiceSupabase().rpc('submit_project_access_request', { p_project: project, p_user: userId })
  if (error) throw new Error(error.message)
  return data
}
export async function reviewAccessRequest(project: string, requestId: string, reviewer: string, attempt: number, decision: 'approved' | 'declined', role: 'admin' | 'member' | 'guest'): Promise<AccessResult> {
  const { data, error } = await getServiceSupabase().rpc('review_project_access_request', {
    p_project: project, p_request: requestId, p_reviewer: reviewer, p_attempt: attempt, p_decision: decision, p_role: role,
  })
  if (error) throw new Error(error.message)
  return data
}
