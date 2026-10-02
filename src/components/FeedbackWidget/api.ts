import { normalizeReviewStatus } from './format'
import type { Comment } from './types'

export interface AgentEligibility {
  canRequest: boolean
  mustSignUp: boolean
  isProjectMember: boolean
  currentTier?: string | null
}

export async function fetchProjectComments(apiBase: string, projectId: string, onPrivacy?: (required: boolean) => void): Promise<Comment[]> {
  const res = await fetch(`${apiBase}/v1/public/comments?projectKey=${encodeURIComponent(projectId)}`)
  if (!res.ok && res.status !== 401) throw new Error('Could not refresh feedback')
  onPrivacy?.(res.status === 401)
  if (res.status === 401) return []

  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error('Invalid feedback response')

  return data.map((comment) => {
    const c = comment as Comment
    return {
      ...c,
      reviewStatus: normalizeReviewStatus((comment as { reviewStatus?: unknown }).reviewStatus),
    }
  })
}

export async function fetchAgentEligibility(apiBase: string, projectId: string): Promise<AgentEligibility | null> {
  try {
    const url = new URL(`${apiBase}/v1/agent/eligibility`, window.location.origin)
    url.searchParams.set('project_id', projectId)

    const res = await fetch(url.toString())
    if (!res.ok) return null

    const data = await res.json() as Partial<AgentEligibility> & {
      can_request?: boolean
      must_sign_up?: boolean
      is_project_member?: boolean
      current_tier?: string | null
    }
    return {
      canRequest: data.canRequest === true || data.can_request === true,
      mustSignUp: data.mustSignUp === true || data.must_sign_up === true,
      isProjectMember: data.isProjectMember === true || data.is_project_member === true,
      currentTier: data.currentTier ?? data.current_tier ?? null,
    }
  } catch {
    return null
  }
}

export async function postComment(
  apiBase: string,
  payload: Record<string, unknown>,
  onLoginRequired?: () => void,
): Promise<Partial<Comment> | null> {
  const res = await fetch(`${apiBase}/v1/public/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) onLoginRequired?.()
  if (!res.ok) {
    console.warn('[FeedbackWidget] API returned', res.status)
    return null
  }
  return (await res.json()) as Partial<Comment>
}

export async function patchReviewStatus(apiBase: string, id: string, reviewStatus: string): Promise<void> {
  try {
    await fetch(`${apiBase}/v1/public/comments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reviewStatus }),
    })
  } catch (err) {
    console.warn('[FeedbackWidget] PATCH failed:', err)
  }
}

export async function deleteComment(apiBase: string, id: string, projectKey: string): Promise<void> {
  try {
    const url = new URL(`${apiBase}/v1/public/comments`, window.location.origin)
    url.searchParams.set('id', id)
    url.searchParams.set('projectKey', projectKey)
    await fetch(url.toString(), { method: 'DELETE' })
  } catch (err) {
    console.warn('[FeedbackWidget] DELETE failed:', err)
  }
}
