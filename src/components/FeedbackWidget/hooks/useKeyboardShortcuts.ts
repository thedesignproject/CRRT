import { useEffect, useRef } from 'react'
import type { Mode } from '../types'

interface UseKeyboardShortcutsArgs {
  mode: Mode
  onEscape: () => void
  onCmdEnter: () => void
  onToggleAgents: () => void
  onToggleMode: () => void
  onEnterFeedback: () => void
  onToggleSidebar: () => void
  onTogglePins: () => void
}

export function useKeyboardShortcuts(args: UseKeyboardShortcutsArgs) {
  const argsRef = useRef(args)
  argsRef.current = args

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const a = argsRef.current
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'Escape') {
        a.onEscape()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && a.mode === 'commenting') {
        a.onCmdEnter()
      }

      if (isTyping) return

      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        a.onToggleAgents()
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        a.onToggleMode()
      }
      if (e.key === 's' || e.key === 'S') {
        a.onEnterFeedback()
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'f' || e.key === 'F') {
        a.onToggleSidebar()
      }
      if (e.key === 'h' || e.key === 'H') {
        a.onTogglePins()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
