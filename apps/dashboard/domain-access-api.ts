import type { DomainSuggestion } from '../../api/_lib/domain-access'
import type { AccessRequest } from '../../api/_lib/project-access-requests'
export type { DomainSuggestion, AccessRequest }
export type AccessRole = 'member' | 'guest' | 'admin'

export function domainAccessApi(base: string, token: string) {
  async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const response = await fetch(`${base.replace(/\/$/, '')}/v1/projects${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json()
    if (response.status === 403 && data.error === 'Forbidden') throw new Error('Project admin access is required. Your permissions may have changed.')
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
    return data
  }
  const path = (project: string) => `/${encodeURIComponent(project)}`
  return {
    suggestions: () => request<DomainSuggestion[]>('/suggestions'),
    domains: (project: string) => request<{ domain: string }[]>(`${path(project)}/email-domains`),
    addDomain: (project: string, domain: string) => request(`${path(project)}/email-domains`, 'POST', { domain }),
    removeDomain: (project: string, domain: string) => request(`${path(project)}/email-domains?${new URLSearchParams({ domain })}`, 'DELETE'),
    requests: (project: string) => request<AccessRequest[]>(`${path(project)}/access-requests`),
    submit: (project: string) => request<AccessRequest>(`${path(project)}/access-requests`, 'POST'),
    review: (project: string, id: string, decision: 'approved' | 'declined', role: AccessRole, attempt: number) => request<AccessRequest>(`${path(project)}/access-requests/${encodeURIComponent(id)}`, 'PATCH', { decision, role, attempt }),
  }
}
