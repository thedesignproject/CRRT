import { browser } from 'wxt/browser'

export type ExtensionProject = {
  publicKey: string
  name: string
  allowedOrigins: string[]
  role?: 'owner' | 'admin' | 'member' | 'guest'
  capabilities?: string[]
}

export type ExtensionProjectSelection = Pick<ExtensionProject, 'publicKey' | 'name' | 'role' | 'capabilities'>

export const ACTIVE_PROJECT_STORAGE_KEY = 'crrt:active-project'
export const HOST_PROJECTS_STORAGE_KEY = 'crrt:projects-by-host'
export const HOST_PROJECT_STORAGE_PREFIX = 'crrt:project-for-host:'

export type HostProjectPreferences = Record<string, ExtensionProjectSelection | null>

function projectSelection(project: ExtensionProject): ExtensionProjectSelection {
  return {
    publicKey: project.publicKey,
    name: project.name,
    ...(project.role ? { role: project.role } : {}),
    ...(project.capabilities ? { capabilities: project.capabilities } : {}),
  }
}

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
    if (accessible) return projectSelection(accessible)
  }
  const matches = matchingProjects(pageUrl, projects)
  return matches.length === 1 ? projectSelection(matches[0]) : null
}

function isProjectSelection(value: unknown): value is ExtensionProjectSelection {
  if (!value || typeof value !== 'object') return false
  const project = value as Partial<ExtensionProjectSelection>
  return typeof project.publicKey === 'string' && typeof project.name === 'string'
}

export function hostProjectStorageKey(hostname: string) {
  return `${HOST_PROJECT_STORAGE_PREFIX}${hostname}`
}

async function getLegacyHostProjectPreferences(): Promise<HostProjectPreferences> {
  const stored = await browser.storage.local.get(HOST_PROJECTS_STORAGE_KEY)
  const value = stored[HOST_PROJECTS_STORAGE_KEY]
  return value && typeof value === 'object' ? value as HostProjectPreferences : {}
}

async function getHostProjectPreference(hostname: string): Promise<{
  present: boolean
  value: ExtensionProjectSelection | null
}> {
  const key = hostProjectStorageKey(hostname)
  const stored = await browser.storage.local.get(key)
  const value = stored[key]
  if (value === null || isProjectSelection(value)) return { present: true, value }

  const legacy = await getLegacyHostProjectPreferences()
  if (!Object.prototype.hasOwnProperty.call(legacy, hostname)) return { present: false, value: null }
  const legacyValue = legacy[hostname]
  if (legacyValue !== null && !isProjectSelection(legacyValue)) return { present: false, value: null }
  await browser.storage.local.set({ [key]: legacyValue })
  return { present: true, value: legacyValue }
}

export async function getActiveProject(): Promise<ExtensionProjectSelection | null> {
  const stored = await browser.storage.local.get(ACTIVE_PROJECT_STORAGE_KEY)
  const value = stored[ACTIVE_PROJECT_STORAGE_KEY]
  if (!isProjectSelection(value)) return null
  return {
        publicKey: value.publicKey,
        name: value.name,
        ...(value.role ? { role: value.role } : {}),
        ...(Array.isArray(value.capabilities) ? { capabilities: value.capabilities } : {}),
      }
}

export async function setActiveProject(project: ExtensionProjectSelection | null) {
  const current = await getActiveProject()
  if (JSON.stringify(current) === JSON.stringify(project)) return
  if (project) await browser.storage.local.set({ [ACTIVE_PROJECT_STORAGE_KEY]: project })
  else await browser.storage.local.remove(ACTIVE_PROJECT_STORAGE_KEY)
}

export async function resolveProjectForPage(pageUrl: string, projects: ExtensionProject[]) {
  const hostname = normalizePageHostname(pageUrl)
  if (!hostname) return null
  const preference = await getHostProjectPreference(hostname)
  const preferences = preference.present ? { [hostname]: preference.value } : {}
  const preferred = preference.value
  const hasAccessiblePreference = preferred === null
    || projects.some((project) => project.publicKey === preferred.publicKey)
  const selection = resolveProjectSelection(pageUrl, projects, preferences)
  if (!preference.present || !hasAccessiblePreference) {
    const key = hostProjectStorageKey(hostname)
    if (selection) await browser.storage.local.set({ [key]: selection })
    else if (preference.present) await browser.storage.local.remove(key)
  }
  return selection
}

export async function setProjectForPage(pageUrl: string, project: ExtensionProjectSelection | null) {
  const hostname = normalizePageHostname(pageUrl)
  if (!hostname) return
  await browser.storage.local.set({ [hostProjectStorageKey(hostname)]: project })
}

export async function getCurrentTabUrl() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return typeof tab?.url === 'string' && normalizePageHostname(tab.url) ? tab.url : null
}
