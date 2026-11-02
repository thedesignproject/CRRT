import { applyPublicMetadata } from './applyPublicMetadata'
import { publicPages } from './publicPages'

/** Keep document identity in sync when the docs router changes pages in-place. */
export function updatePublicMetadata(pathname: string) {
  const path = pathname.replace(/\/$/, '') || '/'
  const page = publicPages.find(page => page.path === path)
  if (!page) return
  applyPublicMetadata(page)
}
