import { cn } from "../lib/utils";

export type FilterOption<T extends string> = { id: T; label: string; count: number };

type FilterTabsProps<T extends string> = {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Status filter with counts (All / Open / Agent / Testing / Done). Arrow keys move. */
export function FilterTabs<T extends string>({ label, options, value, onChange }: FilterTabsProps<T>) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.id)}"]`)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-0.5">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            data-value={o.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected ? "bg-surface-4 text-text-strong" : "text-text-subtle hover:text-text-body"
            )}
          >
            {o.label}
            <span className={cn("font-mono text-xs", o.count === 0 ? "text-agent-idle" : "text-text-subtle")}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
