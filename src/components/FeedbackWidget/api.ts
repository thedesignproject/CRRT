import { normalizeReviewStatus } from './format'
import type { Comment } from './types'
import { widgetRequest, type WidgetLoginSession } from '../../lib/widgetLogin'

export interface AgentEligibility {
  canRequest: boolean
  mustSignUp: boolean
  isProjectMember: boolean
  currentTier?: string | null
}

export type WidgetAgentAccessState =
  | 'project_access_denied'
  | 'forbidden'
  | 'upgrade_required'
  | 'owner_upgrade_required'
  | 'seat_limit_reached'
  | 'ready'

export interface WidgetAgentComment {
  id: string
  pageUrl: string
  selector: string
  body: string
  reviewStatus: 'open' | 'accepted' | 'rejected'
  implementationStatus: 'unassigned' | 'claimed' | 'in_progress' | 'blocked' | 'ready_for_testing' | 'done'
  claimedByAgentId: string | null
  createdAt: string
  authorName?: string | null
}

export interface WidgetAgentEligibility {
  state: WidgetAgentAccessState
  role?: string
  collaboratorSeatLimit?: number
  comments?: WidgetAgentComment[]
}

export interface WidgetAgentSessionResponse {
  shareId: string
  slug: string
  token: string
  tokenUrl: string
  expiresAt: string
  commentCount: number
}

export async function fetchWidgetAgentEligibility(
  apiBase: string,
  projectKey: string,
  pageUrl: string,
  session: WidgetLoginSession,
): Promise<WidgetAgentEligibility> {
  const query = new URLSearchParams({ projectKey, pageUrl })
  return (await widgetRequest(apiBase, `/v1/widget/agent/eligibility?${query}`, session)).json()
}

export async function createWidgetAgentSession(
  apiBase: string,
  input: { projectKey: string; pageUrl: string; commentIds: string[]; idempotencyKey: string },
  session: WidgetLoginSession,
): Promise<WidgetAgentSessionResponse> {
  return (await widgetRequest(apiBase, '/v1/widget/agent/session', session, {
    method: 'POST',
    body: JSON.stringify(input),
  })).json()
}

export async function mutateWidgetFeedback(
  apiBase: string,
  input: { projectKey: string; pageUrl: string; commentIds: string[]; action: 'accept' | 'reject' | 'resolve' },
  session: WidgetLoginSession,
): Promise<{ comments: WidgetAgentComment[] }> {
  return (await widgetRequest(apiBase, '/v1/widget/feedback', session, {
    method: 'POST',
    body: JSON.stringify(input),
  })).json()
}

export async function startWidgetAgentUpgrade(
  apiBase: string,
  input: { projectKey: string; pageUrl: string },
  session: WidgetLoginSession,
): Promise<{ url: string }> {
  return (await widgetRequest(apiBase, '/v1/widget/agent/upgrade', session, {
    method: 'POST',
    body: JSON.stringify(input),
  })).json()
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
