import { useEffect, useState } from 'react'
import { ShortcutBar, type Shortcut } from '@crrt/ui/crrt'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'

interface StatusBarProps {
  agentAvailable?: boolean
  personal?: boolean
}

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/** Keyboard legend, toggled with "?" so it stays out of the way. Absent when shortcuts are turned off. */
export function StatusBar({ agentAvailable = true, personal = false }: StatusBarProps) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!shortcutsEnabled) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setShown(false); return }
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      setShown((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsEnabled])

  if (!shortcutsEnabled || !shown) return null
  const project = !personal
  const shortcuts: Shortcut[] = [
    ...(project ? [{ keys: ['A'], label: 'send to agent' }, { keys: ['M'], label: 'done' }, { keys: ['D'], label: 'reject' }] : []),
    { keys: ['Space'], label: 'next' },
    { keys: ['J', 'K'], label: 'nav' },
    ...(project && agentAvailable ? [{ keys: ['S'], label: 'agent' }] : []),
    ...(project ? [{ keys: ['⌘K'], label: 'search' }] : []),
    { keys: ['?'], label: 'hide' },
  ]
  return <ShortcutBar shortcuts={shortcuts} />
}
