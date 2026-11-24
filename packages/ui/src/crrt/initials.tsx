import { cn } from "../lib/utils";

/**
 * Person avatar fallback. Neutral on purpose: carrot never decorates people. Pass
 * `decorative` when the name is already written next to it, so it isn't read twice.
 */
export function Initials({ name, size = "md", decorative = false, className }: { name: string; size?: "sm" | "md"; decorative?: boolean; className?: string }) {
  const letters = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      title={name}
      aria-hidden={decorative || undefined}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-4 font-medium text-text-body ring-1 ring-border",
        size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs",
        className
      )}
    >
      <span aria-hidden="true">{letters}</span>
      {!decorative && <span className="sr-only">{name}</span>}
    </span>
  );
}
