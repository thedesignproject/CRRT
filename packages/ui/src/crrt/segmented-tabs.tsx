import { cn } from "../lib/utils";
import { focusableTab, onTabKeyDown } from "./roving-tabs";

type SegmentedTabsProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** "sm" is a quieter control for a secondary choice next to a primary one. */
  size?: "md" | "sm";
  className?: string;
};

/** Compact segmented control (filters, agent client picker). Arrow keys, Home and End move selection. */
export function SegmentedTabs<T extends string>({ label, options, value, onChange, size = "md", className }: SegmentedTabsProps<T>) {
  const focusable = focusableTab(options, value);
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => onTabKeyDown(e, options, value, onChange)}
      className={cn("inline-flex self-start gap-0.5 rounded-[9px] border border-sidebar-border bg-surface-0 p-0.75", className)}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            data-value={option}
            aria-selected={selected}
            tabIndex={option === focusable ? 0 : -1}
            onClick={() => onChange(option)}
            className={cn(
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-[13px]",
              "rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected ? "bg-border text-text-strong" : "text-text-subtle hover:text-text-body"
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
