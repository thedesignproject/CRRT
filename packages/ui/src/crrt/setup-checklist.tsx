import { Check } from "lucide-react";
import { cn } from "../lib/utils";

export type SetupStep = { id: string; label: string; done?: boolean; optional?: boolean; href?: string };

type SetupChecklistProps = {
  steps: SetupStep[];
  /** The step the user should do next; defaults to the first one not done. */
  currentId?: string;
  className?: string;
};

/** Persistent "Get started" checklist pinned at the bottom of the sidebar. */
export function SetupChecklist({ steps, currentId, className }: SetupChecklistProps) {
  const current = currentId ?? steps.find((s) => !s.done && !s.optional)?.id;
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;

  return (
    <section
      aria-label="Get started"
      className={cn("flex flex-col gap-2.5 rounded-[10px] bg-surface-3 p-3 ring-1 ring-border ring-inset", className)}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-text-strong">Get started</p>
        <span className="font-mono text-xs text-text-subtle">
          {done}/{required.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const isCurrent = step.id === current;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-[13px]",
                isCurrent && !step.done ? "text-text-strong" : "text-text-subtle"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-[4px]",
                  step.done ? "bg-agent-done" : isCurrent ? "border-[1.5px] border-carrot" : "border-[1.5px] border-agent-idle"
                )}
              >
                {step.done && <Check className="size-2.5 text-surface-0" strokeWidth={3} />}
              </span>
              {step.href && !step.done ? (
                <a href={step.href} className="hover:text-text-strong hover:underline">
                  {step.label}
                </a>
              ) : (
                <span className={cn(step.done && "line-through")}>{step.label}</span>
              )}
              {step.done && <span className="sr-only"> (done)</span>}
              {step.optional && <span className="ml-auto text-xs text-text-subtle">Optional</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
