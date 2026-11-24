import { cn } from "../lib/utils";

/** Numbered pin. Carrot is reserved for this, the primary action and live agent activity. */
export function Pin({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-pin font-mono text-[11px] font-medium text-pin-foreground",
        className
      )}
    >
      {n}
    </span>
  );
}
