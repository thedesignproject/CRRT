// Bombadil spec for the CRRT feedback widget (local experiment).
//
// Target: the visual-test harness at /widget, which mounts <FeedbackWidget>
// on a fake host page with an in-memory comments adapter. No backend, so
// random clicks can't hurt real data. Pick a harness mode with ?state=
// (idle, empty, send-error, load-error, tracker-error, sending, guest...).
//
// Note: extract() callbacks run inside the page. Keep them self-contained
// (no references to module-level variables other than imported helpers).

import { always, eventually, next, now } from "@antithesishq/bombadil";
import {
  extract,
  actions,
  weighted,
  getFingerprint,
} from "@antithesishq/bombadil/browser";
import {
  clickablePoint,
  inViewport,
  isVisible,
} from "@antithesishq/bombadil/browser/dom";
import {
  clicks,
  inputs,
  scroll,
  reload,
  waitOnce,
} from "@antithesishq/bombadil/browser/defaults/actions";
import { ActionGenerator } from "@antithesishq/bombadil/actions";

// ---------------------------------------------------------------------------
// Built-in properties: no uncaught exceptions, no unhandled promise
// rejections, no console.error, no 4xx/5xx page loads.
// ---------------------------------------------------------------------------
export {
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  noConsoleErrors,
} from "@antithesishq/bombadil/browser/defaults/properties";

// ---------------------------------------------------------------------------
// State we watch
// ---------------------------------------------------------------------------

const host = extract((state) => {
  const text = (id: string) =>
    state.document.getElementById(id)?.textContent ?? null;
  return {
    heading: text("target-heading"),
    copy: text("target-copy"),
    button: text("target-button"),
    edge: text("edge-target"),
  };
});

const widget = extract((state) => {
  const doc = state.document;
  const visible = (el: Element) => isVisible(state.window, el);
  const active = doc.activeElement;
  const modals = Array.from(
    doc.querySelectorAll('[role="dialog"][aria-modal="true"]'),
  ).filter(visible);
  return {
    roots: doc.querySelectorAll("[data-fw-crrt]").length,
    launchers: doc.querySelectorAll("[data-fw-launcher-root]").length,
    openModals: modals.length,
    focusOnBody: !active || active === doc.body || active === doc.documentElement,
    // Did the last click land on blank space (not a control)? Clicking blank
    // space moves focus to <body> in every browser; that's mouse-only and fine.
    clickMissedControl: (() => {
      const a = state.lastAction as unknown;
      if (!a || typeof a !== "object" || !("Click" in a)) return false;
      const { x, y } = (a as { Click: { point: { x: number; y: number } } }).Click.point;
      const hit = doc.elementFromPoint(x, y);
      return !hit?.closest('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]');
    })(),
    pinLabels: Array.from(doc.querySelectorAll("[data-fw-pin]")).map(
      (el) => (el.textContent ?? "").trim(),
    ),
  };
});

// ---------------------------------------------------------------------------
// CRRT properties
// ---------------------------------------------------------------------------

// The widget lives on customers' pages. It must never change their content.
// (Highlights may wrap text in spans, but textContent must stay the same.)
export const hostPageUntouched = always(() => {
  const h = host.current;
  return (
    (h.heading === null || h.heading === "A page worth reviewing") &&
    (h.copy === null ||
      h.copy ===
        "Select an element or quote this sentence to leave precise visual feedback.") &&
    (h.button === null || h.button === "Review this action") &&
    (h.edge === null || h.edge === "An action near the page edge")
  );
});

// Never mounted twice (e.g. a double portal or StrictMode leak).
export const singleWidgetMount = always(
  () => widget.current.roots <= 1 && widget.current.launchers <= 1,
);

// Once mounted, the launcher never disappears: users can always get back in.
export const launcherAlwaysPresent = always(
  () => widget.current.roots === 0 || widget.current.launchers === 1,
);

// Never two modal dialogs stacked at once (name modal + provider modal...).
export const atMostOneModal = always(() => widget.current.openModals <= 1);

// Accessibility (rules/ux.md): when a modal opens, focus moves into it quickly.
// A click on blank space (e.g. the backdrop) sends focus to <body> in every
// browser, so that also settles it: the dialog did its part.
export const focusMovesIntoNewModal = always(
  now(() => widget.current.openModals === 0)
    .and(next(() => widget.current.openModals > 0))
    .implies(
      next(
        eventually(
          () => widget.current.openModals === 0 || !widget.current.focusOnBody || widget.current.clickMissedControl,
        ).within(2, "seconds"),
      ),
    ),
);

// Accessibility: while a modal stays open, focus never falls out of it to
// <body>, unless the user clicked blank space (mouse-only, browser default).
export const modalNeverDropsFocus = always(
  now(() => widget.current.openModals > 0 && !widget.current.focusOnBody)
    .and(next(() => widget.current.openModals > 0 && widget.current.focusOnBody))
    .implies(next(() => widget.current.clickMissedControl)),
);

// Escape never does nothing while something is open: the topmost open layer
// (same priority as the widget's Escape handler) must close within 1 second.
const layers = extract((state) => {
  const doc = state.document;
  const win = state.window;
  // Closed layers stay in the DOM (transparent or slid off screen), so "open"
  // means: present, not transparent, and at least partly inside the window.
  const shown = (el: Element | null | undefined) => {
    if (!el) return false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = win.getComputedStyle(n);
      if (cs.opacity === "0" || cs.visibility === "hidden" || cs.display === "none") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < win.innerWidth && r.top < win.innerHeight;
  };
  const dialog = Array.from(doc.querySelectorAll('[data-fw-crrt] [role="dialog"][aria-modal="true"]')).some(shown);
  const pinPopover = shown(doc.querySelector("[data-fw-pin-backdrop]"));
  const composerOpen = shown(doc.querySelector('textarea[placeholder="Leave your comment…"]'));
  // Pin-placing mode has no permanent marker: count it only while its hover
  // frame or hint bar is showing (may miss it, never invents it).
  const selecting = shown(doc.querySelector("[data-fw-selector-frame]"))
    || (doc.body?.innerText ?? "").includes("Click an element or select text");
  const sidebar = Array.from(doc.querySelectorAll('[data-fw-crrt] button[aria-label="Close"]'))
    .some((b) => !b.closest('[role="dialog"]') && shown(b));
  const launcherMenu = shown(doc.querySelector("[data-fw-launcher-menu]"));
  const open = [dialog, pinPopover, composerOpen, selecting, sidebar, launcherMenu];
  const top = open.findIndex(Boolean);
  const a = state.lastAction as unknown;
  const pressedEscape = !!a && typeof a === "object" && "PressKey" in a && (a as { PressKey: { code: number } }).PressKey.code === 27;
  return {
    // 6 = dialog … 1 = launcher menu, 0 = nothing open
    top: top === -1 ? 0 : open.length - top,
    names: ["dialog", "pin popover", "composer", "pin placing", "sidebar", "launcher menu"].filter((_, i) => open[i]),
    pressedEscape,
  };
});

export const escapeAlwaysCloses = always(() => {
  const before = layers.current;
  return now(() => before.top > 0)
    .and(next(() => layers.current.pressedEscape))
    .implies(next(eventually(() => layers.current.top < before.top).within(1, "seconds")));
});

// Pin numbers must be unique (no two "3" pins after add/delete churn).
export const pinNumbersUnique = always(() => {
  const labels = widget.current.pinLabels.filter((l) => l !== "");
  return new Set(labels).size === labels.length;
});

// --- Correctness: Send is never silent -------------------------------------
// Within 3 seconds of clicking Send with text in the composer, the widget must
// show one of: the "Saved" hint (success), an error alert with the draft
// still in the composer (failure, nothing lost), or the name prompt.
const composer = extract((state) => {
  const doc = state.document;
  const box = doc.querySelector<HTMLTextAreaElement>('textarea[placeholder="Leave your comment…"]');
  const alert = Array.from(doc.querySelectorAll('[data-fw-crrt] [role="alert"]')).some((el) => isVisible(state.window, el));
  const nameDialog = doc.querySelector('[role="dialog"][aria-label="Your feedback identity"]') !== null;
  const saved = (doc.body?.textContent ?? "").includes("Saved. Drop another");
  const a = state.lastAction as unknown;
  let clickedSend = false;
  if (a && typeof a === "object" && "Click" in a) {
    const fp = (a as { Click: { fingerprint: Record<string, unknown> } }).Click.fingerprint;
    const label = String(fp.accessibleName ?? fp.accessible_name ?? fp.textContent ?? fp.text_content ?? "").trim();
    clickedSend = /^Send\b/.test(label) && !/^Send to/.test(label);
  }
  return { open: box !== null, text: box?.value ?? "", alert, nameDialog, saved, clickedSend };
});

export const sendNeverSilent = always(() => {
  const draft = composer.current.text;
  return now(() => composer.current.open && draft.trim() !== "")
    .and(next(() => composer.current.clickedSend))
    .implies(
      next(
        eventually(() => {
          const c = composer.current;
          return c.saved || c.nameDialog || (c.alert && c.text === draft);
        }).within(3, "seconds"),
      ),
    );
});

// --- Correctness: actions reach the server (public mode + mock API only) ---
// harness.vite.config.ts publishes the mock server's state into #__mock_state.
const server = extract((state) => {
  const doc = state.document;
  const publicMode = state.window.location.search.includes("public=1");
  const raw = doc.getElementById("__mock_state")?.textContent ?? "";
  let parsed: { count: number; accepted: number; posts: number; approvals: number; deletes: number } | null = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  const a = state.lastAction as unknown;
  let clicked = "";
  if (a && typeof a === "object" && "Click" in a) {
    const fp = (a as { Click: { fingerprint: Record<string, unknown> } }).Click.fingerprint;
    clicked = String(fp.accessibleName ?? fp.accessible_name ?? fp.textContent ?? fp.text_content ?? "").trim();
  }
  const alertTexts = Array.from(doc.querySelectorAll('[data-fw-crrt] [role="alert"]'))
    .filter((el) => isVisible(state.window, el))
    .map((el) => (el.textContent ?? "").trim());
  return {
    tracked: publicMode && parsed !== null,
    count: parsed?.count ?? 0,
    posts: parsed?.posts ?? 0,
    reloaded: state.lastAction === "Reload",
    approvals: parsed?.approvals ?? 0,
    deletes: parsed?.deletes ?? 0,
    clicked,
    alerts: alertTexts.length,
    duplicateAlerts: alertTexts.length - new Set(alertTexts).size,
  };
});

// Clicking Delete either reaches the server (its delete counter goes up) or shows an error.
export const deleteReachesServer = always(() => {
  const before = server.current;
  return now(() => before.tracked)
    .and(next(() => server.current.clicked === "Delete"))
    .implies(
      next(eventually(() => server.current.deletes > before.deletes || server.current.alerts > 0).within(3, "seconds")),
    );
});

// Clicking Approve either reaches the server (its approval counter goes up) or shows an error.
export const approveReachesServer = always(() => {
  const before = server.current;
  return now(() => before.tracked)
    .and(next(() => server.current.clicked === "Approve"))
    .implies(
      next(eventually(() => server.current.approvals > before.approvals || server.current.alerts > 0).within(3, "seconds")),
    );
});

// Clicking Send with text either reaches the server (its post counter goes up),
// shows an error, or asks for a name first. "Saved" on screen is not enough.
export const sendReachesServer = always(() => {
  const before = server.current;
  const draft = composer.current.text;
  return now(() => before.tracked && composer.current.open && draft.trim() !== "")
    .and(next(() => composer.current.clickedSend))
    .implies(
      next(
        eventually(() => server.current.posts > before.posts || server.current.alerts > 0 || composer.current.nameDialog)
          .within(3, "seconds"),
      ),
    );
});

// After a reload settles, the pins on screen match the comments the server
// holds (reload resets the widget to "all comments, pins visible").
export const pinsMatchServerAfterReload = always(() =>
  now(() => server.current.tracked)
    .and(next(() => server.current.reloaded))
    .implies(next(eventually(() => widget.current.pinLabels.length === server.current.count).within(4, "seconds"))),
);

// The same error message is never shown twice at once. (Different messages in
// different places, e.g. a dialog's own error over a page toast, are fine.)
export const noDuplicateAlerts = always(() => server.current.duplicateAlerts === 0);

// Leaks are checked by leak-probe.mjs instead: Chrome's live listener/DOM
// counts include garbage not yet collected, and Bombadil can't force a GC,
// so raw-count rules here only produce false alarms.

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// The default click generator only targets buttons/links/inputs. In
// selecting mode the widget pins *any* element, so also click plain host
// content (headings, paragraphs, the nested scroll area).
const hostTargets = extract((state) => {
  const out: { fingerprint: ReturnType<typeof getFingerprint>; point: { x: number; y: number } }[] = [];
  const els = state.document.querySelectorAll(
    "main h1, main h2, main p, #target-button, #edge-target",
  );
  for (const el of Array.from(els)) {
    if (!isVisible(state.window, el)) continue;
    const point = clickablePoint(el);
    if (!point || !inViewport(state.window, point)) continue;
    out.push({ fingerprint: getFingerprint(el), point });
  }
  return out;
});

const clickHostContent = actions(() =>
  hostTargets.current.map((t) => ({ Click: t })),
);

// Pins are <div data-fw-pin> with onClick, invisible to the default clicks.
const pinTargets = extract((state) => {
  const out: { fingerprint: ReturnType<typeof getFingerprint>; point: { x: number; y: number } }[] = [];
  for (const el of Array.from(state.document.querySelectorAll("[data-fw-pin]"))) {
    const point = clickablePoint(el);
    if (!point || !inViewport(state.window, point)) continue;
    out.push({ fingerprint: getFingerprint(el), point });
  }
  return out;
});

const clickPins = actions(() => pinTargets.current.map((t) => ({ Click: t })));

// Escape drives most of the widget's state machine (close, cancel, exit mode).
const pressEscape = actions(() => [{ PressKey: { code: 27 } }]);

// Buttons and menu items that make up the main feedback flow. Random clicks
// rarely chain "open menu -> drop comment -> pick target -> type -> send",
// so we boost these whenever they are on screen.
const flowTargets = extract((state) => {
  const FLOW =
    /^(Send|Save|Approve|Accept|Reject|Done|Edit|Delete|Retry|Try again|Cancel|↗ Send to)/;
  const out: { fingerprint: ReturnType<typeof getFingerprint>; point: { x: number; y: number }; name: string }[] = [];
  const els = state.document.querySelectorAll(
    'button:not(:disabled), [role="menuitem"], [role="button"]',
  );
  for (const el of Array.from(els)) {
    const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    if (!FLOW.test(name)) continue;
    if (!isVisible(state.window, el)) continue;
    const point = clickablePoint(el);
    if (!point || !inViewport(state.window, point)) continue;
    out.push({ fingerprint: getFingerprint(el), point, name });
  }
  return out;
});

const clickFlow = actions(() => flowTargets.current.map(({ fingerprint, point }) => ({ Click: { fingerprint, point } })));

// What the user is currently doing: typing in a field, with or without text.
const editing = extract((state) => {
  const el = state.document.activeElement;
  const editable = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text");
  return {
    editing: editable,
    hasText: editable ? (el as HTMLTextAreaElement | HTMLInputElement).value.trim().length > 0 : false,
  };
});

// Weights change with the state: type when a field is focused and empty,
// favour the flow buttons (Send, Save, ...) once there is text.
export const widgetActions = new ActionGenerator(() => {
  const { editing: isEditing, hasText } = editing.current;
  const typing = isEditing ? (hasText ? 15 : 80) : 5;
  const flow = flowTargets.current.length === 0 ? 1 : hasText ? 120 : 60;
  return weighted([
    [flow, clickFlow],
    [typing, inputs],
    [50, clicks],
    [40, clickHostContent],
    [25, clickPins],
    [10, pressEscape],
    [8, scroll],
    [4, waitOnce],
    [1, reload],
  ]).generate();
});
