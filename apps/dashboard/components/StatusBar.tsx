import { ShortcutBar, type Shortcut } from '@crrt/ui/crrt'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'

interface StatusBarProps {
  agentAvailable?: boolean
  personal?: boolean
}

/** Keyboard legend under every dashboard view. Hidden when shortcuts are turned off. */
export function StatusBar({ agentAvailable = true, personal = false }: StatusBarProps) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  if (!shortcutsEnabled) return null
  const project = !personal
  const shortcuts: Shortcut[] = [
    ...(project ? [{ keys: ['A'], label: 'send to agent' }, { keys: ['M'], label: 'done' }, { keys: ['D'], label: 'reject' }] : []),
    { keys: ['Space'], label: 'next' },
    { keys: ['J', 'K'], label: 'nav' },
    ...(project && agentAvailable ? [{ keys: ['S'], label: 'sidebar' }] : []),
    ...(project ? [{ keys: ['⌘K'], label: 'search' }] : []),
  ]
  return <ShortcutBar shortcuts={shortcuts} />
}
