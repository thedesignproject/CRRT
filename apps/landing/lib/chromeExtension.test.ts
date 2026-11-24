import { describe, expect, it } from 'vitest'
import { CHROME_WEB_STORE_URL, chromeExtensionHref } from './chromeExtension'

describe('chromeExtensionHref', () => {
  it('links to the Chrome Web Store listing by default', () => {
    expect(chromeExtensionHref(undefined)).toBe(CHROME_WEB_STORE_URL)
    expect(chromeExtensionHref('  ')).toBe(CHROME_WEB_STORE_URL)
  })

  it('honors a configured listing URL', () => {
    expect(chromeExtensionHref('https://example.com/extension')).toBe('https://example.com/extension')
  })
})
