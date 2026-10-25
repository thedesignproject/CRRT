import { browser } from 'wxt/browser'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { mountRecordingPageHost } from '../lib/record-page-host'

export async function mountActiveRecording() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'record:surface-mount' }) as { ok?: boolean; data?: { sessionId?: string } }
    if (response?.ok && response.data?.sessionId) mountRecordingPageHost(response.data.sessionId)
  } catch {
    // Restricted or stale pages remain untouched.
  }
}

export default defineUnlistedScript(() => { void mountActiveRecording() })
