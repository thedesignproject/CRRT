import { cn } from "../lib/utils";

/** Person avatar fallback. Neutral on purpose: carrot never decorates people. */
export function Initials({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  const letters = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      title={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-4 font-medium text-text-body ring-1 ring-border",
        size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs",
        className
      )}
    >
      <span aria-hidden="true">{letters}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
