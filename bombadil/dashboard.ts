// Bombadil spec for the CRRT dashboard in mock mode.
// Target: harness route /dashboard/?mock=1 (fixtures from apps/dashboard/lib/mocks.ts,
// plus the in-memory /api from mock-api.ts for calls the hooks don't mock).

import { always, eventually, now } from "@antithesishq/bombadil";
import { extract, actions, weighted } from "@antithesishq/bombadil/browser";
import { isVisible } from "@antithesishq/bombadil/browser/dom";
import {
  clicks,
  inputs,
  scroll,
  back,
  forward,
  reload,
  waitOnce,
} from "@antithesishq/bombadil/browser/defaults/actions";

export {
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
} from "@antithesishq/bombadil/browser/defaults/properties";

// Like the default noConsoleErrors, but ignores errors caused by endpoints
// our mock API doesn't implement (they answer "Not mocked"; see out/mock-*.log).
const consoleErrors = extract((state) =>
  state.console
    .filter((e) => e.level === "error")
    .map((e) => e.args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
    .filter((m) => !m.includes("Not mocked")),
);
export const noConsoleErrors = always(() => consoleErrors.current.length === 0);

const page = extract((state) => {
  const doc = state.document;
  const root = doc.getElementById("root");
  const visible = (el: Element) => isVisible(state.window, el);
  const loading = Array.from(
    doc.querySelectorAll('[aria-busy="true"], [role="status"], [role="progressbar"]'),
  )
    .filter(visible)
    .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim())
    .filter((t) => /^Loading/i.test(t) || t === "");
  return {
    path: state.window.location.pathname,
    textLength: (root?.innerText ?? "").trim().length,
    loading,
    alerts: Array.from(doc.querySelectorAll('[role="alert"]'))
      .filter(visible)
      .map((el) => (el.textContent ?? "").trim().slice(0, 120))
      .filter((t) => !t.includes("Not mocked")),
  };
});

// No error boundary exists, so a render crash shows up as a blank screen.
// A blank screen may appear briefly while loading, never for long.
export const neverStuckBlank = always(
  now(() => page.current.textLength === 0).implies(
    eventually(() => page.current.textLength > 0).within(5, "seconds"),
  ),
);

// Loading indicators always finish (mocked data is instant).
export const loadingAlwaysFinishes = always(
  now(() => page.current.loading.length > 0).implies(
    eventually(() => page.current.loading.length === 0).within(10, "seconds"),
  ),
);

// Error alerts never pile up.
export const atMostOneAlert = always(() => page.current.alerts.length <= 1);

// The selected status tab's count matches the rows listed under it.
const inbox = extract((state) => {
  const doc = state.document;
  const tab = doc.querySelector('[role="tablist"][aria-label="Status"] [role="tab"][aria-selected="true"]');
  if (!tab) return null;
  const count = Number(tab.querySelector("span:last-child")?.textContent ?? "NaN");
  const list = doc.getElementById(tab.getAttribute("aria-controls") ?? "");
  const rows = list?.querySelectorAll(":scope > .animate-stagger > div").length ?? 0;
  const busy = (list?.textContent ?? "").includes("Loading comments") || (list?.textContent ?? "").includes("Failed to load");
  const allTab = doc.querySelector('[role="tablist"][aria-label="Status"] [role="tab"][data-value="all"] span:last-child');
  const heading = Array.from(doc.querySelectorAll("h2")).find((h) => /^(Feedback|Inbox)\s/.test(h.textContent ?? ""));
  return {
    tab: tab.getAttribute("data-value") ?? "",
    count,
    rows,
    busy,
    allCount: Number(allTab?.textContent ?? "NaN"),
    headingCount: Number(heading?.querySelector("span")?.textContent ?? "NaN"),
  };
});

export const tabCountMatchesRows = always(() => {
  const i = inbox.current;
  return i === null || i.busy || i.count === i.rows;
});

// The "Feedback N" heading always agrees with the All tab.
export const headingMatchesAllTab = always(() => {
  const i = inbox.current;
  return i === null || Number.isNaN(i.headingCount) || i.headingCount === i.allCount;
});

// Exploration stays inside the dashboard app.
export const staysInDashboard = always(() => page.current.path.startsWith("/dashboard"));

const pressEscape = actions(() => [{ PressKey: { code: 27 } }]);

export const dashboardActions = weighted([
  [100, clicks],
  [40, inputs],
  [15, scroll],
  [10, pressEscape],
  [8, back],
  [2, forward],
  [2, reload],
  [4, waitOnce],
]);
