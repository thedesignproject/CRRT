import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type AgentState = "working" | "paused" | "done" | "idle";

export type AgentStep = { t: string; tool: string; detail?: string; state?: "done" | "running" };

const STATE_LABEL: Record<AgentState, string> = {
  working: "Working",
  paused: "Paused · needs you",
  done: "Done",
  idle: "Waiting",
};

const DOT: Record<AgentState, string> = {
  working: "bg-agent-working animate-pulse motion-reduce:animate-none",
  paused: "bg-agent-paused",
  done: "bg-agent-done",
  idle: "bg-agent-idle",
};

const TEXT: Record<AgentState, string> = {
  working: "text-agent-working",
  paused: "text-agent-paused",
  done: "text-agent-done",
  idle: "text-text-subtle",
};

type AgentRunCardProps = {
  agent: string;
  state: AgentState;
  title: string;
  steps: AgentStep[];
  /** Shown under the log, e.g. the run's queue. */
  children?: ReactNode;
  className?: string;
};

/** What the agent is doing now, with its mono step log. Violet = agent; amber = a human must look. */
export function AgentRunCard({ agent, state, title, steps, children, className }: AgentRunCardProps) {
  return (
    <section
      aria-label={`${agent} run`}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-surface-3 p-4 ring-1 ring-border ring-inset",
        state === "working" && "ring-carrot-line",
        className
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[state])} />
        <span className="font-medium text-text-strong">{agent}</span>
        <span className={cn("text-xs", TEXT[state])}>{STATE_LABEL[state]}</span>
      </header>
      <p className="text-text-body">{title}</p>
      {steps.length > 0 && (
        <ol aria-label="Agent steps" className="flex flex-col gap-1 rounded-lg bg-surface-0 p-3 font-mono text-xs ring-1 ring-border ring-inset">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-10 shrink-0 text-agent-idle">{s.t}</span>
              <span className={s.state === "running" ? "text-agent-working" : "text-text-body"}>{s.tool}</span>
              {s.detail && <span className="min-w-0 truncate text-text-subtle">{s.detail}</span>}
              {s.state === "running" && (
                <span aria-label="running" className="ml-auto animate-pulse text-agent-working motion-reduce:animate-none">●</span>
              )}
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}
