import { useEffect } from 'react'
import type { Mode } from '../types'

interface UseKeyboardShortcutsArgs {
  mode: Mode
  sidebarOpen: boolean
  selectedPin: string | null
  showNameModal: boolean
  onEscape: () => void
  onCmdEnter: () => void
  onToggleAgents: () => void
  onToggleMode: () => void
  onEnterFeedback: () => void
  onToggleSidebar: () => void
  onTogglePins: () => void
}

export function useKeyboardShortcuts({
  mode,
  sidebarOpen,
  selectedPin,
  showNameModal,
  onEscape,
  onCmdEnter,
  onToggleAgents,
  onToggleMode,
  onEnterFeedback,
  onToggleSidebar,
  onTogglePins,
}: UseKeyboardShortcutsArgs) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'Escape') {
        onEscape()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && mode === 'commenting') {
        onCmdEnter()
      }

      if (isTyping) return

      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        onToggleAgents()
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        onToggleMode()
      }
      if (e.key === 's' || e.key === 'S') {
        onEnterFeedback()
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'f' || e.key === 'F') {
        onToggleSidebar()
      }
      if (e.key === 'h' || e.key === 'H') {
        onTogglePins()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    mode,
    sidebarOpen,
    selectedPin,
    showNameModal,
    onEscape,
    onCmdEnter,
    onToggleAgents,
    onToggleMode,
    onEnterFeedback,
    onToggleSidebar,
    onTogglePins,
  ])
}
