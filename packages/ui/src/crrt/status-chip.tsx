import { cn } from "../lib/utils";

export type CommentStatus = "open" | "agent" | "testing" | "fixed";

export const STATUS_LABEL: Record<CommentStatus, string> = {
  open: "Open",
  agent: "Agent",
  testing: "Testing",
  fixed: "Done",
};

const STYLES: Record<CommentStatus, string> = {
  open: "bg-status-open-bg text-status-open-fg",
  agent: "bg-status-agent-bg text-status-agent-fg",
  testing: "bg-status-testing-bg text-status-testing-fg",
  fixed: "bg-status-fixed-bg text-status-fixed-fg",
};

/**
 * Where a comment is in its lifecycle. Uses --status-* only. The one exception is the live
 * dot: an "agent" comment pulses only while an agent is actually working on it (`working`),
 * so queued work doesn't look like work in progress.
 */
export function StatusChip({ status, working = false, className }: { status: CommentStatus; working?: boolean; className?: string }) {
  const live = status === "agent" && working;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium", STYLES[status], className)}>
      {live && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-agent-working motion-reduce:animate-none" />}
      {STATUS_LABEL[status]}
      {live && <span className="sr-only">, agent working</span>}
    </span>
  );
}
