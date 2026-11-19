import { Kbd } from "../components/kbd";

export type Shortcut = { keys: string[]; label: string };

/** Footer legend of keyboard shortcuts. Dense UI is keyboard UI. */
export function ShortcutBar({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <footer aria-label="Keyboard shortcuts" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sidebar-border bg-surface-1 px-5 py-2 text-xs text-text-subtle">
      {shortcuts.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {s.keys.map((k) => (
            <Kbd key={k} className="bg-surface-4 font-mono text-text-body">
              {k}
            </Kbd>
          ))}
          {s.label}
        </span>
      ))}
    </footer>
  );
}
