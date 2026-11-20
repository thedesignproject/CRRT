import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/**
 * Runs before anything reaches the clipboard. Resolve false to copy nothing, true to copy
 * the text as given, or a string to copy that instead (e.g. with an ID decided meanwhile).
 */
export type CopyGate = () => Promise<boolean | string>;

/**
 * Clipboard copy that reports what actually happened. "copied" resets after a moment;
 * "failed" stays until the next attempt, so people know to select the text themselves.
 * A gate that says no leaves the state "idle": nothing was copied, on purpose.
 */
export function useCopy(resetMs = 1600) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(text: string, gate?: CopyGate): Promise<CopyState> {
    window.clearTimeout(timer.current);
    const result = await write(text, gate);
    setState(result);
    if (result === "copied") timer.current = window.setTimeout(() => setState("idle"), resetMs);
    return result;
  }

  return { state, copy };
}

async function write(text: string, gate?: CopyGate): Promise<CopyState> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (gate && clipboard?.write && typeof ClipboardItem !== "undefined") {
    // Browsers only allow clipboard writes during the click, but the gate may wait on a
    // server. Hand the clipboard a pending item now; it fills in once the gate allows it.
    const allowed = gate().catch(() => false as const);
    const blob = allowed.then((ok) => (ok === false ? Promise.reject(new Error("copy cancelled")) : new Blob([ok === true ? text : ok], { type: "text/plain" })));
    blob.catch(() => {}); // the write below reports it
    try {
      await clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return "copied";
    } catch {
      return (await allowed) === false ? "idle" : "failed";
    }
  }
  const allowed = gate ? await gate().catch(() => false as const) : true;
  if (allowed === false) return "idle";
  try {
    if (!clipboard) return "failed";
    await clipboard.writeText(allowed === true ? text : allowed);
    return "copied";
  } catch {
    return "failed";
  }
}
