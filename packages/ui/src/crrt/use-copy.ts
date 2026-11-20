import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/**
 * Clipboard copy that reports what actually happened. "copied" resets after a moment;
 * "failed" stays until the next attempt, so people know to select the text themselves.
 */
export function useCopy(resetMs = 1600) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(text: string): Promise<boolean> {
    window.clearTimeout(timer.current);
    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      /* blocked by the browser or a permission policy */
    }
    setState(ok ? "copied" : "failed");
    if (ok) timer.current = window.setTimeout(() => setState("idle"), resetMs);
    return ok;
  }

  return { state, copy };
}
