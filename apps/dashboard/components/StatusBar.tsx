import { Kbd } from './primitives'

interface StatusBarProps {
  sidebarOpen: boolean
  onShowSidebar: () => void
}

export function StatusBar({ sidebarOpen, onShowSidebar }: StatusBarProps) {
  return (
    <footer className="flex items-center gap-5 px-5 h-[32px] shrink-0 border-t border-border bg-card text-[10px] font-mono text-muted-foreground">
      <span><Kbd>A</Kbd> ready</span>
      <span><Kbd>M</Kbd> done</span>
      <span><Kbd>D</Kbd> reject</span>
      <span><Kbd>Space</Kbd> next</span>
      <span><Kbd>J</Kbd>/<Kbd>K</Kbd> nav</span>
      <span><Kbd>S</Kbd> sidebar</span>
      <span><Kbd>⌘K</Kbd> search</span>
      <div className="flex-1" />
      {!sidebarOpen && (
        <button onClick={onShowSidebar} className="text-[11px] font-semibold text-primary hover:underline">
          Show agent panel
        </button>
      )}
    </footer>
  )
}
