import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Set<(message: unknown) => unknown>()
vi.mock('wxt/browser', () => ({ browser: { runtime: {
  getURL: (path: string) => `chrome-extension://crrt${path}`,
  onMessage: { addListener: (listener: any) => listeners.add(listener), removeListener: (listener: any) => listeners.delete(listener) },
} } }))

import { connectRecordingPageHost, mountRecordingPageHost } from './record-page-host'

describe('recording page host', () => {
  beforeEach(() => { document.documentElement.innerHTML = '<head></head><body></body>'; listeners.clear() })

  it('mounts one isolated controls frame per session', () => {
    const first = mountRecordingPageHost('session one')
    expect(first.dataset.crrtRecording).toBe('true')
    expect(first.shadowRoot).toBeNull()
    expect(mountRecordingPageHost('session one')).toBe(first)
    expect(mountRecordingPageHost('session two')).not.toBe(first)
  })

  it('allows page interaction in pointer mode except over reported controls', () => {
    const host = document.createElement('div')
    const frame = document.createElement('iframe')
    host.attachShadow({ mode: 'open' }).append(frame); document.body.append(host)
    connectRecordingPageHost(frame, 's')
    for (const listener of listeners) listener({ type: 'record:overlay-interaction', sessionId: 's', tool: 'pointer', rects: [[10, 10, 20, 20], ['bad']] })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }))
    expect(frame.style.pointerEvents).toBe('none')
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 15, clientY: 15 }))
    expect(frame.style.pointerEvents).toBe('auto')
    for (const listener of listeners) listener({ type: 'record:overlay-pointer', sessionId: 's', x: 5, y: 5 })
    expect(frame.style.pointerEvents).toBe('none')
    for (const listener of listeners) listener({ type: 'record:overlay-interaction', sessionId: 's', tool: 'draw', rects: [] })
    expect(frame.style.pointerEvents).toBe('auto')
  })

  it('ignores other sessions and removes its host on command', () => {
    const host = document.createElement('div')
    const frame = document.createElement('iframe')
    host.attachShadow({ mode: 'open' }).append(frame); document.body.append(host)
    connectRecordingPageHost(frame, 's')
    for (const listener of listeners) listener({ type: 'record:overlay-interaction', sessionId: 'other', tool: 'draw', rects: [] })
    expect(frame.style.pointerEvents).toBe('')
    for (const listener of listeners) listener({ type: 'record:overlay-remove', sessionId: 's' })
    expect(host.isConnected).toBe(false)
    expect(listeners.size).toBe(0)
  })
})
