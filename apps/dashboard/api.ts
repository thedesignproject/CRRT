export interface Project {
  publicKey: string
  slug: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CommentRecord {
  id: string
  projectId: string
  pageUrl: string
  selector: string
  x: number
  y: number
  body: string
  reviewStatus: 'open' | 'accepted' | 'rejected'
  implementationStatus: 'unassigned' | 'claimed' | 'in_progress' | 'blocked' | 'done'
  claimedByAgentId: string | null
  imageUrl: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectSessionResponse {
  projectKey: string
  projectName: string
  doc: { slug: string; token: string; docUrl: string; promptUrl: string }
}

export interface SharePromptResponse {
  slug: string
  target: string
  prompt: string
  docUrl: string
}

export interface ShareCreationResponse {
  shareId: string
  slug: string
  token: string
  tokenUrl: string
  expiresAt: string
  commentCount: number
}

export interface ShareState {
  share: {
    id: string
    slug: string
    scopeType: 'page' | 'selection'
    scopePageUrl: string | null
    expiresAt: string
    revision: number
  }
  project: {
    publicKey: string
    slug: string
    name: string
    repoUrl: string | null
    localPath: string | null
    defaultBranch: string
    installCommand: string
    devCommand: string | null
    testCommand: string | null
    buildCommand: string | null
    agentInstructions: string | null
  }
  comments: CommentRecord[]
  presence: Array<{
    agentId: string
    status: string
    summary: string | null
    lastSeenAt: string
  }>
  capabilities: {
    presence: boolean
    ops: boolean
  }
}

export interface ShareEventsResponse {
  events: Array<{
    id: number
    shareId: string
    commentId: string | null
    actorType: string
    actorId: string
    eventType: string
    payload: Record<string, unknown>
    createdAt: string
  }>
  nextCursor: number
}

function authHeaders(reviewerToken?: string) {
  const headers: Record<string, string> = {}
  if (reviewerToken) {
    headers.Authorization = `Bearer ${reviewerToken}`
  }
  return headers
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, ' ').trim()
    throw new Error(`Expected JSON from ${url} but got: ${preview || '(empty body)'}. Is the API server running?`)
  }
}

export function listProjects(apiBase: string, reviewerToken: string) {
  return requestJson<Project[]>(`${apiBase}/v1/projects`, {
    headers: {
      ...authHeaders(reviewerToken),
    },
  })
}

export function createProject(apiBase: string, reviewerToken: string, name: string) {
  return requestJson<Project>(`${apiBase}/v1/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(reviewerToken),
    },
    body: JSON.stringify({ name }),
  })
}

export function listComments(apiBase: string, reviewerToken: string, projectId: string, pageUrl?: string) {
  const query = new URLSearchParams()
  if (pageUrl) query.set('pageUrl', pageUrl)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return requestJson<CommentRecord[]>(`${apiBase}/v1/projects/${encodeURIComponent(projectId)}/comments${suffix}`, {
    headers: {
      ...authHeaders(reviewerToken),
    },
  })
}

export function updateReviewStatus(apiBase: string, reviewerToken: string, commentId: string, reviewStatus: CommentRecord['reviewStatus']) {
  return requestJson<CommentRecord>(`${apiBase}/v1/comments/${encodeURIComponent(commentId)}/review-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(reviewerToken),
    },
    body: JSON.stringify({ reviewStatus }),
  })
}

export function updateImplementationStatus(apiBase: string, reviewerToken: string, commentId: string, implementationStatus: CommentRecord['implementationStatus']) {
  return requestJson<CommentRecord>(`${apiBase}/v1/comments/${encodeURIComponent(commentId)}/implementation-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(reviewerToken),
    },
    body: JSON.stringify({ implementationStatus }),
  })
}

export function createShare(apiBase: string, reviewerToken: string, body: Record<string, unknown>) {
  return requestJson<ShareCreationResponse>(`${apiBase}/v1/feedback-shares`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(reviewerToken),
    },
    body: JSON.stringify(body),
  })
}

export function getPrompt(apiBase: string, reviewerToken: string, shareId: string, target: 'codex' | 'claude-code' | 'generic') {
  return requestJson<{ prompt: string, tokenUrl: string }>(
    `${apiBase}/v1/feedback-shares/${encodeURIComponent(shareId)}/prompt?target=${encodeURIComponent(target)}`,
    {
      headers: {
        ...authHeaders(reviewerToken),
      },
    },
  )
}

export function fetchProjectSession(apiBase: string, projectKey: string) {
  return requestJson<ProjectSessionResponse>(
    `${apiBase}/v1/public/project?projectKey=${encodeURIComponent(projectKey)}`,
  )
}

export function getPromptByShare(
  apiBase: string,
  slug: string,
  token: string,
  target: 'codex' | 'claude-code' | 'generic',
) {
  return requestJson<SharePromptResponse>(
    `${apiBase}/v1/shares/${encodeURIComponent(slug)}/prompt?token=${encodeURIComponent(token)}&target=${encodeURIComponent(target)}`,
  )
}

export function getShareState(apiBase: string, slug: string, token: string) {
  return requestJson<ShareState>(`${apiBase}/v1/agent/shares/${encodeURIComponent(slug)}/state`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export function getShareEvents(apiBase: string, slug: string, token: string, after: number) {
  return requestJson<ShareEventsResponse>(
    `${apiBase}/v1/agent/shares/${encodeURIComponent(slug)}/events?after=${after}&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )
}
