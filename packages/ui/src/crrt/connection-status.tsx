import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { InlineCode } from "./command-block";

export type ConnectionState = "waiting" | "connected" | "failed";

type ConnectionStatusProps = {
  state: ConnectionState;
  /** Agent client name once connected, e.g. "Claude Code". */
  client?: string;
  /** What CRRT is waiting for. Defaults to the agent's first MCP call. */
  waitingFor?: ReactNode;
  /** Hint shown while waiting. */
  hint?: ReactNode;
  /** Overrides the connected / failed sentence. */
  message?: ReactNode;
  className?: string;
};

/**
 * Live check that the agent reached CRRT. Setup is not "done" until a real
 * `list_projects` call lands — the restart hint attacks the most common MCP drop-off.
 */
export function ConnectionStatus({ state, client, waitingFor, hint = "Not seeing it? Restart the agent session.", message, className }: ConnectionStatusProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-3.5 py-3 text-[13px]",
        state === "waiting" && "bg-status-agent-bg text-status-agent-fg",
        state === "connected" && "bg-status-fixed-bg text-status-fixed-fg",
        state === "failed" && "bg-status-testing-bg text-status-testing-fg",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          state === "waiting" && "animate-pulse bg-agent-working motion-reduce:animate-none",
          state === "connected" && "bg-agent-done",
          state === "failed" && "bg-agent-paused"
        )}
      />
      {state === "waiting" && (
        <>
          <span>
            {waitingFor ?? (
              <>
                Waiting for your agent to call <InlineCode>list_projects</InlineCode>
              </>
            )}
            …
          </span>
          {hint && <span className="ml-auto text-text-subtle">{hint}</span>}
        </>
      )}
      {state === "connected" && <span>{message ?? <>{client ?? "Your agent"} is connected. Tell it “review with CRRT”.</>}</span>}
      {state === "failed" && (
        <span>{message ?? "We couldn’t reach your agent. Run the command again, then restart its session."}</span>
      )}
    </div>
  );
}
