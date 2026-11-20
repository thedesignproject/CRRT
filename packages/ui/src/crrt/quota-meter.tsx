import { cn } from "../lib/utils";
import { CarrotMark } from "./carrot-mark";

type QuotaMeterProps = {
  plan: string;
  used: number;
  limit: number;
  /** Shown as a link at the end; omit to hide. */
  upgradeHref?: string;
  className?: string;
};

/**
 * Agent-call quota, always visible in the top bar. CRRT charges for the agentic part only,
 * so this is the one meter that matters. The carrot "grows" along the bar.
 */
export function QuotaMeter({ plan, used, limit, upgradeHref, className }: QuotaMeterProps) {
  const max = Math.max(0, limit);
  const left = Math.max(0, max - used);
  // A zero limit means nothing is left: show a full bar instead of dividing by zero.
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((used / max) * 100))) : 100;

  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-[13px]", className)}>
      <span className="text-text-body">{plan}</span>
      <div
        role="meter"
        aria-label="Agent calls used this week"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(Math.max(0, used), max)}
        aria-valuetext={`${used} of ${max} used`}
        className="relative h-1.5 w-24 rounded-full bg-border xl:w-40"
      >
        <div className="h-1.5 rounded-full bg-carrot" style={{ width: `${pct}%` }} />
        <CarrotMark size={16} className="absolute -top-[5px] -translate-x-1/2" style={{ left: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-text-subtle">
        {left} of {max} agent calls left this week
      </span>
      {upgradeHref && (
        <a href={upgradeHref} className="ml-auto font-medium text-carrot hover:underline">
          Upgrade
        </a>
      )}
    </div>
  );
}
