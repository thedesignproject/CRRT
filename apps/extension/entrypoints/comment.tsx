import { browser } from 'wxt/browser'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { connectPageHost } from '../lib/page-host'

type ActivationData = { active: true; activationId: string }

function activationData(value: unknown): value is ActivationData {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as Partial<ActivationData>).active === true
    && typeof (value as Partial<ActivationData>).activationId === 'string',
  )
}

export async function mountWidgetIfActive(activate = false) {
  try {
    const response = await browser.runtime.sendMessage({ type: 'comment:is-active' }) as { ok?: boolean; data?: unknown }
    if (response?.ok && activationData(response.data)) mountWidget(response.data.activationId, activate)
  } catch {
    // Navigation and extension restarts should leave an unauthorized document untouched.
  }
}

export function mountWidget(activationId: string, activate = false) {
  if (document.querySelector('[data-crrt-extension]')) {
    if (activate) window.dispatchEvent(new CustomEvent('crrt:activate'))
    return
  }
  const host = document.createElement('div')
  host.dataset.crrtExtension = 'true'; host.dataset.fw = 'true'
  const frame = document.createElement('iframe')
  frame.title = 'CRRT private comments'
  frame.allow = 'microphone'
  // Match private.html's root scheme so Chrome keeps the embedded canvas transparent on dark sites.
  frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;background:transparent;z-index:2147483647;clip-path:inset(100%);color-scheme:light;'
  // The extension origin, not the shadow root, isolates typing and private image requests.
  frame.src = browser.runtime.getURL('/private.html')
  host.attachShadow({ mode: 'closed' }).append(frame)
  document.documentElement.append(host)
  let cleaned = false
  let deactivating = false
  let disconnect = () => {}
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    disconnect()
    host.remove()
    window.removeEventListener('pagehide', cleanup)
  }
  const deactivate = async () => {
    if (cleaned || deactivating) return
    deactivating = true
    try {
      const response = await browser.runtime.sendMessage({ type: 'comment:deactivate', activationId }) as { ok?: boolean; data?: unknown }
      if (response?.ok && response.data === true) cleanup()
    } catch {
      // Keep the widget mounted so the user can retry instead of silently restoring it later.
    } finally {
      deactivating = false
    }
  }
  disconnect = connectPageHost(frame, activate, () => { void deactivate() })
  window.addEventListener('pagehide', cleanup, { once: true })
}

export default defineUnlistedScript(() => mountWidgetIfActive(true))
