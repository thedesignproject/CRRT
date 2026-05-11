import { normalizeReviewStatus } from './format'
import type { Comment } from './types'

export async function fetchProjectComments(apiBase: string, projectId: string): Promise<Comment[]> {
  try {
    const res = await fetch(`${apiBase}/v1/public/comments?projectKey=${encodeURIComponent(projectId)}`)
    if (!res.ok) return []

    const data: unknown = await res.json()
    if (!Array.isArray(data)) return []

    return data.map((comment) => {
      const c = comment as Comment
      return {
        ...c,
        reviewStatus: normalizeReviewStatus((comment as { reviewStatus?: unknown }).reviewStatus),
      }
    })
  } catch {
    return []
  }
}

export async function postComment(
  apiBase: string,
  payload: Record<string, unknown>,
): Promise<Partial<Comment> | null> {
  const res = await fetch(`${apiBase}/v1/public/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
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
