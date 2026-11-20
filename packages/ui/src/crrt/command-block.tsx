import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";
import { useCopy } from "./use-copy";

type CommandBlockProps = {
  /** The exact command the user (or their agent) runs. */
  command: string;
  /** Optional numbered steps shown under the command. */
  steps?: ReactNode[];
  /** Fires only when the command actually reached the clipboard. */
  onCopy?: (command: string) => void;
  className?: string;
};

/** A copyable shell command with optional follow-up steps. Used in Connect and docs. */
export function CommandBlock({ command, steps, onCopy, className }: CommandBlockProps) {
  const { state, copy } = useCopy();
  const copied = state === "copied";

  async function copyCommand() {
    if ((await copy(command)) === "copied") onCopy?.(command);
  }

  return (
    <div className={cn("overflow-hidden rounded-lg bg-surface-0 ring-1 ring-border ring-inset", className)}>
      <div className="flex items-start gap-2.5 px-3.5 py-3 font-mono leading-7 text-[13px]">
        <span aria-hidden="true" className="text-text-subtle">$</span>
        <code className="min-w-0 flex-1 text-text-strong">{command}</code>
        <button
          type="button"
          onClick={copyCommand}
          aria-label={copied ? "Copied" : state === "failed" ? "Couldn’t copy, select the command instead" : "Copy command"}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-3 px-2.5 font-sans text-xs text-text-strong transition-colors hover:bg-surface-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5 text-agent-done" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : state === "failed" ? "Select to copy" : "Copy"}
        </button>
      </div>
      {steps && steps.length > 0 && <StepList steps={steps} className="border-t border-sidebar-border" />}
    </div>
  );
}

/** Inline mono for commands and file names inside prose. */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.92em] text-text-strong">{children}</code>;
}

/** Numbered setup steps. Standalone, or under a CommandBlock. */
export function StepList({ steps, className }: { steps: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("flex list-decimal flex-col gap-1.5 py-3 pr-3.5 pl-8.5 text-sm text-text-body", className)}>
      {steps.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  );
}
