import type { ReactNode } from "react";
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
  /** Delivery status from a direct send, such as "Queued". */
  status?: string;
  /** Kind of change, such as "copy" or "design". */
  tag?: string;
  /** Titles of the Brain rules the step follows. */
  rules?: string[];
};

type NextStepRowProps = {
  step: NextStep;
  /** Selection for a partial handoff. Without onToggle the row has no checkbox. */
  checked?: boolean;
  onToggle?: (id: string) => void;
  /** Opens the step's source comment. */
  onOpen?: (id: string) => void;
  /** Shown under the meta line, e.g. a rule conflict the agent paused on. */
  children?: ReactNode;
};

/** One next step: what to change, who asked and the rules it follows. */
export function NextStepRow({ step, checked = false, onToggle, onOpen, children }: NextStepRowProps) {
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
          {step.tag && <span className="rounded-md bg-surface-4 px-1.5 font-mono text-text-body">{step.tag}</span>}
          <span className="flex items-center -space-x-1">
            {step.requesters.map((r) => (
              <Initials key={r} name={r} size="sm" />
            ))}
          </span>
          <span>
            {step.comments} {step.comments === 1 ? "comment" : "comments"}
          </span>
          {step.rules?.map((rule) => (
            <span key={rule} className="font-mono">· Follows: {rule}</span>
          ))}
          {done && <span className="text-agent-done">· completed by {step.doneBy}</span>}
          {step.status ? (
            <span className={step.active ? "text-agent-working" : undefined}>· {step.status}</span>
          ) : (
            step.active && <span className="text-agent-working">· agent working</span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}
