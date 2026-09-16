import { browser } from 'wxt/browser'

export const EXTENSION_DISCLOSURE_VERSION = 1
export const EXTENSION_DISCLOSURE_KEY = 'crrt:disclosure-version'

export async function hasAcceptedDisclosure(): Promise<boolean> {
  const stored = await browser.storage.local.get(EXTENSION_DISCLOSURE_KEY)
  return stored[EXTENSION_DISCLOSURE_KEY] === EXTENSION_DISCLOSURE_VERSION
}

export async function acceptDisclosure(): Promise<void> {
  await browser.storage.local.set({ [EXTENSION_DISCLOSURE_KEY]: EXTENSION_DISCLOSURE_VERSION })
}

export function publicCrrtUrl(path: '/privacy' | '/support'): string {
  const dashboard = new URL(import.meta.env.WXT_DASHBOARD_URL)
  return new URL(path, dashboard.origin).href
}
