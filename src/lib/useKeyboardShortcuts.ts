import { useEffect, useState } from 'react'

type Surface = 'widget' | 'dashboard'
const eventName = 'crrt:keyboard-shortcuts'
export const shortcutPreferenceKey = (surface: Surface) => `crrt:keyboard-shortcuts:${surface}`

function read(surface: Surface) {
  try { return localStorage.getItem(shortcutPreferenceKey(surface)) !== 'disabled' }
  catch { return true }
}

/** Personal browser preference, shared across instances on this origin. */
export function useKeyboardShortcuts(surface: Surface) {
  const [enabled, setEnabled] = useState(() => read(surface))
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ surface: Surface; enabled: boolean }>).detail
      if (detail.surface === surface) setEnabled(detail.enabled)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === shortcutPreferenceKey(surface)) setEnabled(read(surface))
    }
    window.addEventListener(eventName, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(eventName, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [surface])

  const update = (value: boolean) => {
    try { localStorage.setItem(shortcutPreferenceKey(surface), value ? 'enabled' : 'disabled') }
    catch { /* Keep the preference for this page when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: { surface, enabled: value } }))
  }
  return [enabled, update] as const
}
