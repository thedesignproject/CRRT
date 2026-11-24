export const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/crrt/kckiejblkmbmdappaofepmbnpbejomon'

// An empty override must not hide the published listing.
export function chromeExtensionHref(override = import.meta.env.VITE_CHROME_EXTENSION_URL) {
  return override?.trim() || CHROME_WEB_STORE_URL
}
