import { browser } from 'wxt/browser'
import type { SessionSummary } from './auth'
import type { Comment } from '../../../src/components/FeedbackWidget/types'
import type { ExtensionProject } from './project-context'

export type ExtensionComment = {
  id: string
  projectId: string | null
  pageUrl: string
  pageHostname: string
  x: number
  y: number
  selector: string
  body: string
  visibility?: 'shared' | 'internal'
  reviewStatus?: 'open' | 'accepted' | 'rejected'
  editable?: boolean
  screenshotUrl: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
  targetType?: Comment['targetType']
  anchor?: Comment['anchor']
}

export type ExternalWorkDraft = {
  provider: 'github' | 'linear'
  connected: boolean
  destination: string | null
  existing: { issueNumber?: number; issueUrl?: string; externalUrl?: string; createdAt: string } | null
  draft: { title: string; body: string }
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

export async function listExtensionProjects() {
  return request<ExtensionProject[]>('/v1/projects')
}

export async function listPageComments(pageUrl: string, page = 1, projectId?: string) {
  const query = new URLSearchParams({ pageUrl, limit: '50', page: String(page) })
  if (projectId) query.set('projectId', projectId)
  return request<{ items: ExtensionComment[]; total: number }>(`/v1/extension/comments?${query}`)
}

export async function listProjectComments(projectId: string, page = 1) {
  const query = new URLSearchParams({ projectId, limit: '50', page: String(page) })
  return request<{ items: ExtensionComment[]; total: number }>(`/v1/extension/comments?${query}`)
}

export function createPageComment(input: { projectId?: string; pageUrl: string; selector: string; x: number; y: number; body: string; visibility?: 'shared' | 'internal'; targetType?: Comment['targetType']; anchor?: Comment['anchor']; screenshot: { base64: string; mimeType: string } | null }) {
  return request<ExtensionComment>('/v1/extension/comments', { method: 'POST', body: JSON.stringify(input) })
}

export function updatePageComment(id: string, body: string) {
  return request<ExtensionComment>(`/v1/extension/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ body }) })
}

export function deletePageComment(id: string) {
  return request<void>(`/v1/extension/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getExternalWorkDraft(commentId: string, provider: 'github' | 'linear' = 'github') {
  return request<ExternalWorkDraft>(`/v1/comments/${encodeURIComponent(commentId)}/external-work?provider=${provider}`)
}

export function sendExternalWork(commentId: string, provider: 'github' | 'linear', draft: { title: string; body: string }) {
  return request<{ issueNumber?: number; issueUrl?: string; externalUrl?: string; createdAt: string; created: boolean }>(
    `/v1/comments/${encodeURIComponent(commentId)}/external-work`,
    { method: 'POST', body: JSON.stringify({ provider, draft }) },
  )
}
