import { Check } from "lucide-react";
import { cn } from "../lib/utils";
import { Initials } from "./initials";

export type NextStep = {
  id: string;
  title: string;
  requesters: string[];
  comments: number;
  /** Set when the agent completed it. */
  doneBy?: string;
  /** The agent is on it right now. */
  active?: boolean;
};

type NextStepRowProps = {
  step: NextStep;
  /** Selection for a partial handoff. Without onToggle the row has no checkbox. */
  checked?: boolean;
  onToggle?: (id: string) => void;
  /** Opens the step's source comment. */
  onOpen?: (id: string) => void;
};

/** One next step: what to change and who asked. */
export function NextStepRow({ step, checked = false, onToggle, onOpen }: NextStepRowProps) {
  const done = Boolean(step.doneBy);
  const title = <span className={cn("font-medium", done ? "text-text-subtle line-through" : "text-text-strong")}>{step.title}</span>;
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-sidebar-border px-5 py-3.5",
        step.active && "bg-surface-3 shadow-[inset_2px_0_0_var(--carrot)]"
      )}
    >
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done || checked}
          aria-label={`Select: ${step.title}`}
          disabled={done}
          onClick={() => onToggle(step.id)}
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            done ? "bg-agent-done" : checked ? "bg-text-strong" : "ring-[1.5px] ring-agent-idle ring-inset"
          )}
        >
          {(done || checked) && <Check className="size-3 text-surface-0" strokeWidth={3} />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {onOpen ? (
          <button type="button" onClick={() => onOpen(step.id)} className="min-w-0 rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {title}
          </button>
        ) : (
          title
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
          <span className="flex items-center -space-x-1">
            {step.requesters.map((r) => (
              <Initials key={r} name={r} size="sm" />
            ))}
          </span>
          <span>
            {step.comments} {step.comments === 1 ? "comment" : "comments"}
          </span>
          {done && <span className="text-agent-done">· completed by {step.doneBy}</span>}
          {step.active && <span className="text-agent-working">· agent working</span>}
        </div>
      </div>
    </li>
  );
}
