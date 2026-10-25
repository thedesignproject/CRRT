import { browser } from 'wxt/browser'
import type { RecordingTool } from './recording'

export type RecordingSurfaceLayout = { tool: RecordingTool; rects: number[][] }

function inside(rect: number[], x: number, y: number) {
  const [left = 0, top = 0, width = 0, height = 0] = rect
  return x >= left && y >= top && x <= left + width && y <= top + height
}

export function connectRecordingPageHost(frame: HTMLIFrameElement, sessionId: string) {
  let layout: RecordingSurfaceLayout = { tool: 'pointer', rects: [] }
  let stopped = false

  const updatePointer = (x: number, y: number) => {
    frame.style.pointerEvents = layout.tool === 'pointer' && !layout.rects.some((rect) => inside(rect, x, y)) ? 'none' : 'auto'
  }
  const move = (event: MouseEvent) => updatePointer(event.clientX, event.clientY)
  const listener = (message: unknown) => {
    const value = message as { type?: unknown; sessionId?: unknown; tool?: unknown; rects?: unknown; x?: unknown; y?: unknown }
    if (value.sessionId !== sessionId) return false
    if (value.type === 'record:overlay-remove') {
      cleanup()
      return false
    }
    if (value.type === 'record:overlay-pointer' && typeof value.x === 'number' && typeof value.y === 'number') {
      updatePointer(value.x, value.y)
      return false
    }
    if (value.type !== 'record:overlay-interaction' || !Array.isArray(value.rects)) return false
    const rects = value.rects.filter((rect): rect is number[] => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite))
    const tool = ['pointer', 'draw', 'arrow', 'box', 'text', 'pin'].includes(String(value.tool)) ? value.tool as RecordingTool : 'pointer'
    layout = { tool, rects }
    frame.style.pointerEvents = tool === 'pointer' ? 'none' : 'auto'
    return false
  }
  const cleanup = () => {
    if (stopped) return
    stopped = true
    browser.runtime.onMessage.removeListener(listener)
    document.removeEventListener('mousemove', move)
    window.removeEventListener('pagehide', cleanup)
    ;(frame.getRootNode() as ShadowRoot).host?.remove()
  }

  browser.runtime.onMessage.addListener(listener)
  document.addEventListener('mousemove', move)
  window.addEventListener('pagehide', cleanup, { once: true })
  return cleanup
}

export function mountRecordingPageHost(sessionId: string) {
  const existing = document.querySelector<HTMLElement>('[data-crrt-recording]')
  if (existing?.dataset.sessionId === sessionId) return existing
  existing?.remove()

  const host = document.createElement('div')
  host.dataset.crrtRecording = 'true'
  host.dataset.sessionId = sessionId
  const frame = document.createElement('iframe')
  frame.title = 'CRRT recording controls'
  frame.allow = 'camera; microphone'
  frame.src = `${new URL('/record-controls.html', browser.runtime.getURL('/private.html')).toString()}?session=${encodeURIComponent(sessionId)}`
  frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;background:transparent;z-index:2147483647;pointer-events:none;color-scheme:dark;'
  host.attachShadow({ mode: 'closed' }).append(frame)
  document.documentElement.append(host)
  connectRecordingPageHost(frame, sessionId)
  return host
}
