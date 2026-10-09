import { getSelector } from '../../../src/lib/getSelector'
import { buildTextRangeAnchor } from '../../../src/lib/textAnchor'
import { captureNativeScreenshot } from './native-screenshot'
import { toPagePercent } from '../../../src/components/FeedbackWidget/coords'
import { receiveFrameMessages, sendFrameMessage } from './frame-channel'

function hasValidCoordinates(x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
}

export function connectPageHost(frame: HTMLIFrameElement, activate: boolean, deactivate: () => void) {
  let frameId = 0, selecting = false, lastState = '', target: HTMLElement | null = null
  let captureTail = Promise.resolve<string | null>(null), disconnected = false, capturing = false
  let targets: { id: string; selector: string; x: number; y: number }[] = []
  let hitRects: number[][] = []
  frame.style.pointerEvents = 'none'
  let highlighted: HTMLElement | null = null, oldOutline = '', oldOffset = ''
  let highlightRevision = 0
  const originalCursor = document.body.style.cursor
  const send = (payload: unknown) => { if (frameId) void sendFrameMessage(frameId, payload).catch(() => {}) }
  function pointer(x: number, y: number) {
    frame.style.pointerEvents = hitRects.some(([left, top, width, height]) =>
      x >= left && y >= top && x <= left + width && y <= top + height) ? 'auto' : 'none'
  }
  function highlight(element: HTMLElement | null) {
    highlightRevision += 1
    if (highlighted) { highlighted.style.outline = oldOutline; highlighted.style.outlineOffset = oldOffset }
    highlighted = element
    if (element) { oldOutline = element.style.outline; oldOffset = element.style.outlineOffset; element.style.outline = '2px solid rgba(232,133,61,.6)'; element.style.outlineOffset = '2px' }
  }
  function state() {
    const liveIds = targets.filter(({ selector, x, y }) => {
      const validCoordinates = hasValidCoordinates(x, y)
      try {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return Boolean((rect && (rect.width || rect.height)) || validCoordinates)
      } catch {
        return validCoordinates
      }
    }).map(({ id }) => id)
    const embeddedProjectIds = Array.from(document.querySelectorAll<HTMLElement>('[data-fw-crrt][data-crrt-project]'))
      .map((node) => node.dataset.crrtProject)
      .filter((projectId): projectId is string => Boolean(projectId))
    return { kind: 'state', url: location.href.split('#')[0], width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight, scrollX, scrollY, liveIds, embeddedProjectIds }
  }
  function update() {
    const next = JSON.stringify(state())
    if (next !== lastState) { lastState = next; send(JSON.parse(next)) }
  }
  const stop = receiveFrameMessages(async (message, from) => {
    if (message.kind === 'ready' && (!frameId || from === frameId)) { frameId = from; return { ...state(), activate } }
    if (from !== frameId) throw new Error('Unregistered private frame')
    if (message.kind === 'layout') {
      // Only geometry crosses into the page DOM; never comment text or image URLs.
      if (!message.rects.every((rect: number[]) => rect.every(Number.isFinite))) throw new Error('Invalid frame bounds')
      hitRects = message.rects
      // Hit testing controls clicks, not painting: stale bounds must never clip a new surface or its shadow.
      frame.style.clipPath = 'none'
    } else if (message.kind === 'pointer') {
      pointer(message.x, message.y)
    } else if (message.kind === 'selecting') {
      selecting = message.value; document.body.style.cursor = selecting ? 'crosshair' : originalCursor; highlight(null)
      if (selecting) frame.style.pointerEvents = 'none'
    } else if (message.kind === 'track') { targets = message.targets; update() }
    else if (message.kind === 'capture') {
      const operation = captureTail.then(async () => {
        if (disconnected) throw new Error('Page disconnected')
        if (target && !target.isConnected) throw new Error('Screenshot target unavailable')
        const viewport = [innerWidth, innerHeight, scrollX, scrollY]
        const focus = target?.getBoundingClientRect() ?? null
        if (focus && (focus.right <= 0 || focus.bottom <= 0 || focus.left >= innerWidth || focus.top >= innerHeight)) {
          throw new Error('Screenshot target outside viewport')
        }
        const overlays = [frame, ...document.querySelectorAll<HTMLElement>('[data-fw-crrt]')]
        const styles = overlays.map((node) => ({ node, value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') }))
        const previousHighlight = highlighted
        capturing = true
        highlight(null)
        const restoreHighlightRevision = highlightRevision
        try {
          // Opacity suppresses descendants that explicitly override inherited visibility.
          const opacities = overlays.map((node) => ({ node, value: node.style.getPropertyValue('opacity'), priority: node.style.getPropertyPriority('opacity') }))
          try {
            for (const node of overlays) { node.style.setProperty('visibility', 'hidden', 'important'); node.style.setProperty('opacity', '0', 'important') }
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            if (disconnected) throw new Error('Page disconnected')
            if ([innerWidth, innerHeight, scrollX, scrollY].some((value, index) => value !== viewport[index])) throw new Error('Viewport changed during screenshot capture')
            const image = await captureNativeScreenshot(focus)
            if (disconnected) throw new Error('Page disconnected')
            return image
          } finally {
            for (const { node, value, priority } of opacities) {
              if (value) node.style.setProperty('opacity', value, priority)
              else node.style.removeProperty('opacity')
            }
          }
        } finally {
          for (const { node, value, priority } of styles) {
            if (value) node.style.setProperty('visibility', value, priority)
            else node.style.removeProperty('visibility')
          }
          capturing = false
          if (!disconnected && highlightRevision === restoreHighlightRevision) highlight(previousHighlight)
        }
      })
      captureTail = operation.catch(() => null)
      return operation
    } else if (message.kind === 'highlight') {
      if (capturing) return
      try { const element = document.querySelector<HTMLElement>(message.selector); element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); highlight(element); window.setTimeout(() => highlight(null), 1400) } catch { /* stale selector */ }
    } else if (message.kind === 'focus-embedded') {
      const match = Array.from(document.querySelectorAll<HTMLElement>('[data-fw-crrt][data-crrt-project]'))
        .some((node) => node.dataset.crrtProject === message.projectId)
      if (match) window.dispatchEvent(new CustomEvent('crrt:activate'))
    } else if (message.kind === 'deactivate') {
      deactivate()
    }
  })
  function move(event: MouseEvent) {
    pointer(event.clientX, event.clientY)
    if (!selecting || capturing) return
    const element = event.target as HTMLElement
    highlight(element.closest('[data-crrt-extension]') ? null : element)
  }
  function click(event: MouseEvent) {
    const element = event.target as HTMLElement
    if (element.closest('[data-crrt-extension]')) return
    if (!selecting) { send({ kind: 'outside' }); return }
    event.preventDefault(); event.stopPropagation(); highlight(null)
    selecting = false; document.body.style.cursor = originalCursor
    target = element
    const selection = window.getSelection()
    const anchor = selection && !selection.isCollapsed && selection.rangeCount ? buildTextRangeAnchor(selection.getRangeAt(0), {
      getSelector, url: location.href, viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      isExcluded: (node) => node.closest('[data-fw]') !== null,
    }) : null
    const point = anchor ? toPagePercent(anchor.midpointClient.x + scrollX, anchor.midpointClient.y + scrollY) : toPagePercent(event.pageX, event.pageY)
    send({ kind: 'target', target: { selector: anchor?.anchor.containerSelector ?? getSelector(element), ...point, url: location.href,
      ...(anchor ? { targetType: 'text_range', anchor: anchor.anchor } : {}) } })
    frame.focus({ preventScroll: true })
  }
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || (event.target as HTMLElement).closest?.('input,textarea,select,[contenteditable="true"]')) return
    send({ kind: 'key', key: event.key, shiftKey: event.shiftKey })
  }
  const activation = () => send({ kind: 'activate' })
  const focusPage = () => send({ kind: 'focus' })
  document.addEventListener('mousemove', move); window.addEventListener('click', click, true)
  window.addEventListener('keydown', key); window.addEventListener('crrt:activate', activation)
  window.addEventListener('focus', focusPage)
  const timer = window.setInterval(update, 300)
  return () => { disconnected = true; stop(); highlight(null); document.body.style.cursor = originalCursor; window.clearInterval(timer)
    document.removeEventListener('mousemove', move); window.removeEventListener('click', click, true)
    window.removeEventListener('keydown', key); window.removeEventListener('crrt:activate', activation); window.removeEventListener('focus', focusPage) }
}
