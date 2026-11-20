import { cn } from "../lib/utils";
import { focusableTab, onTabKeyDown } from "./roving-tabs";

export type FilterOption<T extends string> = { id: T; label: string; count: number };

type FilterTabsProps<T extends string> = {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Id of the list these tabs filter, for aria-controls. */
  controls?: string;
};

/** Status filter with counts (All / Open / Agent / Testing / Done). Arrow keys, Home and End move. */
export function FilterTabs<T extends string>({ label, options, value, onChange, controls }: FilterTabsProps<T>) {
  const ids = options.map((o) => o.id);
  const focusable = focusableTab(ids, value);
  return (
    <div role="tablist" aria-label={label} onKeyDown={(e) => onTabKeyDown(e, ids, value, onChange)} className="flex flex-wrap gap-0.5">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            data-value={o.id}
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={o.id === focusable ? 0 : -1}
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
