import { getServiceSupabase } from './supabase.js'

export type DomainSuggestion = {
  project_key: string
  name: string
  domain: string
  status: 'pending' | 'declined' | 'approved' | null
  retry_at: string | null
}

export function normalizeEmailDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const domain = input.trim().toLowerCase().replace(/^@/, '')
  return domain.length <= 253 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain) ? domain : null
}

export async function suggestDomainProjects(userId: string): Promise<DomainSuggestion[]> {
  const { data, error } = await getServiceSupabase().rpc('suggest_domain_projects', { p_user: userId })
  if (error) throw new Error(error.message)
  return data
}

export async function listEmailDomains(projectKey: string): Promise<{ domain: string }[]> {
  const { data, error } = await getServiceSupabase().from('project_email_domains')
    .select('domain').eq('project_key', projectKey).order('domain')
  if (error) throw new Error(error.message)
  return data!
}

async function mutateEmailDomain(projectKey: string, actor: string, domain: string, remove: boolean): Promise<'updated' | 'forbidden'> {
  const { data, error } = await getServiceSupabase().rpc('mutate_project_email_domain', {
    p_project: projectKey, p_actor: actor, p_domain: domain, p_remove: remove,
  })
  if (error) throw new Error(error.message)
  if (data !== 'updated' && data !== 'forbidden') throw new Error('Invalid domain mutation result')
  return data
}

export function addEmailDomain(projectKey: string, actor: string, domain: string) {
  return mutateEmailDomain(projectKey, actor, domain, false)
}

export function removeEmailDomain(projectKey: string, actor: string, domain: string) {
  return mutateEmailDomain(projectKey, actor, domain, true)
}
