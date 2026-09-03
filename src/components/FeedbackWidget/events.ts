// A closed shadow root retargets events to its host outside the root. Listen
// inside it for the real input/menu target, and ignore that event's outer copy.
export function listenForWidgetEvent<K extends 'keydown' | 'pointerdown'>(
  element: HTMLElement, type: K, listener: (event: WindowEventMap[K]) => void, capture = false,
) {
  const root = element.getRootNode()
  const shadow = root instanceof ShadowRoot ? root : null
  const handled = new WeakSet<Event>()
  const dispatch = (event: WindowEventMap[K]) => {
    if (handled.has(event)) return
    handled.add(event)
    listener(event)
  }
  const outer = (event: WindowEventMap[K]) => {
    if (shadow && event.target === shadow.host) return
    dispatch(event)
  }
  shadow?.addEventListener(type, dispatch as EventListener)
  window.addEventListener(type, outer, capture)
  return () => {
    shadow?.removeEventListener(type, dispatch as EventListener)
    window.removeEventListener(type, outer, capture)
  }
}
