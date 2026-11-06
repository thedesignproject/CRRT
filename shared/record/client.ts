import type { CaptureEvent, Failure, RecordingState } from './contracts'

export type RecordingSummary = {
  id: string; title: string; source: 'tab' | 'window' | 'screen'; state: RecordingState
  durationMs: number | null; authorId: string; markCount: number; createdAt: string
  failure: Failure | null
  thumbnailUrl?: string | null
}
export type RecordingPlayback = {
  recording: RecordingSummary
  artifacts: { id: string; kind: string; url: string; offsetMs: number; expiresInSeconds: number }[]
  transcript: { id: string; start_ms: number; end_ms: number; text: string }[]
  events: CaptureEvent[]
  stages: { stage: string; state: string; failure: Failure | null }[]
  keyframes: { id: string; at_ms: number; artifact_id: string }[]
}

const messages: Record<string, string> = {
  record_upgrade_required: 'A paid plan is required for agent context.',
  record_not_ready: 'This recording is still processing.',
  record_quota: 'Your recording allowance has been reached.',
  record_forbidden: 'You do not have access to this recording.',
  record_not_found: 'This recording is unavailable or its link has been revoked.',
}

export async function recordRequest<T>(base: string, path: string, token: string | null, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, '')}/v1/${path}`, {
    method, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const code = payload.error?.code
    throw new Error(response.status === 401 ? 'Sign in to CRRT to upload recordings.' : messages[code] || `Recording request failed (${response.status}). Retry when your connection is restored.`)
  }
  return response.json()
}

export function recordingShareUrl(dashboard: string, token: string) {
  // A fragment keeps the capability out of HTTP access logs and referrers.
  return `${dashboard.replace(/\/$/, '')}/recording#${token}`
}
