import { browser } from 'wxt/browser'

export type ExtensionProject = {
  publicKey: string
  name: string
  allowedOrigins: string[]
}

export type ExtensionProjectSelection = Pick<ExtensionProject, 'publicKey' | 'name'>

export const ACTIVE_PROJECT_STORAGE_KEY = 'crrt:active-project'
export const HOST_PROJECTS_STORAGE_KEY = 'crrt:projects-by-host'

export type HostProjectPreferences = Record<string, ExtensionProjectSelection | null>

export function normalizePageHostname(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname.toLowerCase().replace(/\.$/, '') || null
  } catch {
    return null
  }
}

function matchesDomain(hostname: string, domain: string) {
  const normalized = normalizePageHostname(domain.includes('://') ? domain : `https://${domain}`)
  return normalized !== null && (hostname === normalized || hostname.endsWith(`.${normalized}`))
}

export function matchingProjects(pageUrl: string, projects: ExtensionProject[]) {
  const hostname = normalizePageHostname(pageUrl)
  if (!hostname) return []
  return projects.filter((project) => project.allowedOrigins.some((domain) => matchesDomain(hostname, domain)))
}

export function resolveProjectSelection(
  pageUrl: string,
  projects: ExtensionProject[],
  preferences: HostProjectPreferences,
): ExtensionProjectSelection | null {
  const hostname = normalizePageHostname(pageUrl)
  if (!hostname) return null
  if (Object.prototype.hasOwnProperty.call(preferences, hostname)) {
    const preferred = preferences[hostname]
    if (preferred === null) return null
    const accessible = projects.find((project) => project.publicKey === preferred.publicKey)
    if (accessible) return { publicKey: accessible.publicKey, name: accessible.name }
  }
  const matches = matchingProjects(pageUrl, projects)
  return matches.length === 1 ? { publicKey: matches[0].publicKey, name: matches[0].name } : null
}

async function getHostProjectPreferences(): Promise<HostProjectPreferences> {
  const stored = await browser.storage.local.get(HOST_PROJECTS_STORAGE_KEY)
  const value = stored[HOST_PROJECTS_STORAGE_KEY]
  return value && typeof value === 'object' ? value as HostProjectPreferences : {}
}

export async function getActiveProject(): Promise<ExtensionProjectSelection | null> {
  const stored = await browser.storage.local.get(ACTIVE_PROJECT_STORAGE_KEY)
  const value = stored[ACTIVE_PROJECT_STORAGE_KEY]
  if (!value || typeof value !== 'object') return null
  const project = value as Partial<ExtensionProjectSelection>
  return typeof project.publicKey === 'string' && typeof project.name === 'string'
    ? { publicKey: project.publicKey, name: project.name }
    : null
}

export async function setActiveProject(project: ExtensionProjectSelection | null) {
  const current = await getActiveProject()
  if (current?.publicKey === project?.publicKey && current?.name === project?.name) return
  if (project) await browser.storage.local.set({ [ACTIVE_PROJECT_STORAGE_KEY]: project })
  else if (current) await browser.storage.local.remove(ACTIVE_PROJECT_STORAGE_KEY)
}

export async function resolveProjectForPage(pageUrl: string, projects: ExtensionProject[]) {
  const hostname = normalizePageHostname(pageUrl)
  if (!hostname) {
    await setActiveProject(null)
    return null
  }
  const preferences = await getHostProjectPreferences()
  const hadPreference = Object.prototype.hasOwnProperty.call(preferences, hostname)
  const preferred = preferences[hostname]
  const hasAccessiblePreference = preferred === null
    || (preferred !== undefined && projects.some((project) => project.publicKey === preferred.publicKey))
  const selection = resolveProjectSelection(pageUrl, projects, preferences)
  if (hadPreference && !hasAccessiblePreference) {
    delete preferences[hostname]
    if (selection) preferences[hostname] = selection
    await browser.storage.local.set({ [HOST_PROJECTS_STORAGE_KEY]: preferences })
  } else if (!hadPreference && selection) {
    preferences[hostname] = selection
    await browser.storage.local.set({ [HOST_PROJECTS_STORAGE_KEY]: preferences })
  }
  await setActiveProject(selection)
  return selection
}

export async function setProjectForPage(pageUrl: string, project: ExtensionProjectSelection | null) {
  const hostname = normalizePageHostname(pageUrl)
  if (hostname) {
    const preferences = await getHostProjectPreferences()
    preferences[hostname] = project
    await browser.storage.local.set({ [HOST_PROJECTS_STORAGE_KEY]: preferences })
  }
  await setActiveProject(project)
}

export async function getCurrentTabUrl() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return typeof tab?.url === 'string' && normalizePageHostname(tab.url) ? tab.url : null
}
