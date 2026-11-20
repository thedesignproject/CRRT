import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";
import { useCopy } from "./use-copy";

type PromptBlockProps = {
  /** Left side of the header: a framework picker, or a plain label. */
  header: ReactNode;
  /** Exact text that lands in the clipboard. */
  prompt: string;
  /** Values to highlight inside the prompt (e.g. the project ID), so people see what's theirs. */
  highlight?: string[];
  /**
   * Fires once the prompt is on the clipboard: from the button when the browser allowed it,
   * or when the person selects the text and copies it. Use it e.g. to create the project
   * the prompt points at.
   */
  onCopy?: () => void;
  /** Blocks copying, e.g. while the project ID is still being checked. */
  disabled?: boolean;
  className?: string;
};

function withHighlights(text: string, highlight: string[]) {
  // Longest first, so "proj_12" wins over "proj_1"; empty values would match everywhere.
  const values = highlight.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!values.length) return text;
  const parts = text.split(new RegExp(`(${values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`));
  return parts.map((p, i) =>
    values.includes(p) ? (
      <mark key={i} className="rounded-sm bg-surface-4 px-0.5 text-text-strong">
        {p}
      </mark>
    ) : (
      p
    )
  );
}

/** "Just show me the prompt": a copyable agent prompt that replaces install snippets. */
export function PromptBlock({ header, prompt, highlight = [], onCopy, disabled = false, className }: PromptBlockProps) {
  const { state, copy } = useCopy();

  async function copyPrompt() {
    if (await copy(prompt)) onCopy?.();
  }

  return (
    <div className={cn("overflow-hidden rounded-lg bg-surface-0 ring-1 ring-border ring-inset", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-2 py-1.5">
        <div className="flex min-w-0 items-center text-xs text-text-subtle">{header}</div>
        <button
          type="button"
          onClick={copyPrompt}
          disabled={disabled}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-text-strong ring-1 ring-border hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Couldn’t copy" : "Copy prompt"}</span>
        </button>
      </div>
      {state === "failed" && (
        <p role="alert" className="border-b border-border px-4 py-2 text-xs text-text-body">
          Your browser blocked copying. Select the prompt below and copy it.
        </p>
      )}
      {/* Not selectable while disabled, so nobody pastes a prompt with a placeholder ID. */}
      <pre
        onCopy={() => { if (!disabled) onCopy?.(); }}
        aria-disabled={disabled || undefined}
        className={cn("max-h-64 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text-body", disabled && "opacity-60 select-none")}
      >
        {withHighlights(prompt, highlight)}
      </pre>
    </div>
  );
}
