import { browser } from 'wxt/browser'

export type ExtensionProject = {
  publicKey: string
  name: string
  allowedOrigins: string[]
}

export type ExtensionProjectSelection = Pick<ExtensionProject, 'publicKey' | 'name'>

export const ACTIVE_PROJECT_STORAGE_KEY = 'crrt:active-project'

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
  if (project) await browser.storage.local.set({ [ACTIVE_PROJECT_STORAGE_KEY]: project })
  else await browser.storage.local.remove(ACTIVE_PROJECT_STORAGE_KEY)
}
