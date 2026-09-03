import { expect, it, vi } from 'vitest'
import { listenForWidgetEvent } from '../components/FeedbackWidget/events'

it('handles light-DOM events and removes the listener', () => {
  const element = document.createElement('div'); document.body.append(element)
  const listener = vi.fn()
  const stop = listenForWidgetEvent(element, 'keydown', listener)
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
  expect(listener).toHaveBeenCalledOnce()
  stop(); element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
  expect(listener).toHaveBeenCalledOnce(); element.remove()
})

it('handles internal closed-root targets once, external events, and cleanup', () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = host.attachShadow({ mode: 'closed' })
  const element = document.createElement('textarea'); root.append(element)
  const targets: EventTarget[] = []
  const stop = listenForWidgetEvent(element, 'pointerdown', (event) => targets.push(event.composedPath()[0]), true)
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  expect(targets).toEqual([element])
  // Models the outer retargeted event even in DOM emulators lacking retargeting.
  host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(targets).toEqual([element])
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(targets).toEqual([element, document.body])
  stop(); element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  expect(targets).toHaveLength(2); host.remove()
})
