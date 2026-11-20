import type { KeyboardEvent } from "react";

/**
 * Keyboard model shared by the tab-style pickers: Left/Right move and wrap, Home/End jump.
 * Returns the id to focus, or null when the key isn't one of ours.
 */
export function nextTabId<T extends string>(key: string, ids: readonly T[], current: T): T | null {
  const i = Math.max(0, ids.indexOf(current));
  if (key === "ArrowRight") return ids[(i + 1) % ids.length];
  if (key === "ArrowLeft") return ids[(i + ids.length - 1) % ids.length];
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  return null;
}

export function onTabKeyDown<T extends string>(e: KeyboardEvent<HTMLElement>, ids: readonly T[], current: T, onChange: (id: T) => void) {
  const next = nextTabId(e.key, ids, current);
  if (next === null) return;
  e.preventDefault();
  onChange(next);
  e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next)}"]`)?.focus();
}

/** The tab that takes Tab focus: the selected one, or the first when the value matches none. */
export function focusableTab<T extends string>(ids: readonly T[], value: T): T | undefined {
  return ids.includes(value) ? value : ids[0];
}
