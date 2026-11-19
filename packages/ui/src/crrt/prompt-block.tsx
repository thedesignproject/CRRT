import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

type PromptBlockProps = {
  /** Left side of the header: a framework picker, or a plain label. */
  header: ReactNode;
  /** Exact text that lands in the clipboard. */
  prompt: string;
  /** Values to highlight inside the prompt (e.g. the project ID), so people see what's theirs. */
  highlight?: string[];
  /** Fires on copy, e.g. to create the project the prompt points at. */
  onCopy?: () => void;
  className?: string;
};

function withHighlights(text: string, values: string[]) {
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
export function PromptBlock({ header, prompt, highlight = [], onCopy, className }: PromptBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(prompt);
    } catch {
      /* clipboard can be blocked; the prompt stays selectable */
    }
    setCopied(true);
    onCopy?.();
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={cn("overflow-hidden rounded-lg bg-surface-0 ring-1 ring-border ring-inset", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-2 py-1.5">
        <div className="flex min-w-0 items-center text-xs text-text-subtle">{header}</div>
        <button
          type="button"
          onClick={copy}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-text-strong ring-1 ring-border hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy prompt"}</span>
        </button>
      </div>
      <pre className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text-body">
        {withHighlights(prompt, highlight)}
      </pre>
    </div>
  );
}
