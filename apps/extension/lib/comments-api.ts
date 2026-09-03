import { browser } from 'wxt/browser'
import type { SessionSummary } from './auth'
import type { Comment } from '../../../src/components/FeedbackWidget/types'

export type ExtensionComment = {
  id: string
  pageUrl: string
  pageHostname: string
  x: number
  y: number
  selector: string
  body: string
  screenshotUrl: string | null
  createdAt: string
  updatedAt: string
  targetType?: Comment['targetType']
  anchor?: Comment['anchor']
}

type AuthResponse = { ok: true; data: SessionSummary | null } | { ok: false; error: string }

export async function extensionSession() {
  const response = await browser.runtime.sendMessage({ type: 'auth:get' }) as AuthResponse
  if (!response?.ok) throw new Error(response?.error || 'CRRT authentication is unavailable')
  return response.data
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await extensionSession()
  if (!session) throw new Error('Sign in to CRRT from the extension')
  const response = await fetch(`${import.meta.env.WXT_API_BASE.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error || `CRRT request failed (${response.status})`)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export async function listPageComments(pageUrl: string, page = 1) {
  const query = new URLSearchParams({ pageUrl, limit: '50', page: String(page) })
  return request<{ items: ExtensionComment[]; total: number }>(`/v1/extension/comments?${query}`)
}

export function createPageComment(input: { pageUrl: string; selector: string; x: number; y: number; body: string; targetType?: Comment['targetType']; anchor?: Comment['anchor']; screenshot: { base64: string; mimeType: string } | null }) {
  return request<ExtensionComment>('/v1/extension/comments', { method: 'POST', body: JSON.stringify(input) })
}

export function updatePageComment(id: string, body: string) {
  return request<ExtensionComment>(`/v1/extension/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ body }) })
}

export function deletePageComment(id: string) {
  return request<void>(`/v1/extension/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
