import { browser } from 'wxt/browser'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { createRoot, type Root } from 'react-dom/client'
import controlStyles from './record-controls/style.css?raw'
import { RecordControls } from './record-controls/main'

let mounted: { host: HTMLElement; root: Root; sessionId: string; listener: (message: unknown) => unknown } | null = null

export function mountRecordingSurface(sessionId: string) {
  if (mounted?.sessionId === sessionId && mounted.host.isConnected) return mounted.host
  if (mounted) {
    browser.runtime.onMessage.removeListener(mounted.listener)
    mounted.root.unmount(); mounted.host.remove()
  }
  const host = document.createElement('div')
  host.dataset.crrtRecording = 'true'
  host.dataset.sessionId = sessionId
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;'
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style'); style.textContent = controlStyles
  const container = document.createElement('div'); container.className = 'crrt-record-root'
  shadow.append(style, container)
  document.documentElement.append(host)
  const root = createRoot(container)
  root.render(<RecordControls id={sessionId} />)
  const listener = (message: unknown) => {
    const value = message as { type?: unknown; sessionId?: unknown }
    if (value.type !== 'record:overlay-remove' || value.sessionId !== sessionId) return false
    browser.runtime.onMessage.removeListener(listener)
    root.unmount(); host.remove(); mounted = null
    return false
  }
  browser.runtime.onMessage.addListener(listener)
  mounted = { host, root, sessionId, listener }
  return host
}

export async function mountActiveRecording() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'record:surface-mount' }) as { ok?: boolean; data?: { sessionId?: string } }
    if (response?.ok && response.data?.sessionId) mountRecordingSurface(response.data.sessionId)
  } catch {
    // Restricted or stale pages remain untouched.
  }
}

export default defineUnlistedScript(() => { void mountActiveRecording() })
