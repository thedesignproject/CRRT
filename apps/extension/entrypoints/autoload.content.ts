import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import { mountWidget } from './comment'

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main: async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: 'comment:is-active' }) as { ok?: boolean; data?: unknown }
      if (response?.ok && response.data === true) mountWidget()
    } catch {
      // An inactive or restarting extension should leave the page untouched.
    }
  },
})
