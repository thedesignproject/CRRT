/**
 * Built-in best-practices checklist, computed against the story's real DOM in
 * the preview iframe (same origin as the manager, so it is directly readable).
 *
 * Honesty contract: a check only reports pass/fail when it actually inspected
 * matching elements. No matching elements → "na". Iframe unreachable → an
 * explicit error instead of results. No fake green checkmarks.
 */

export type CheckStatus = "pass" | "fail" | "na";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  /** Display summary: offenders (on fail) or a short note (on na/pass). */
  details?: string;
  /** Annotated per-element descriptors when status === "fail". */
  failures?: string[];
}

/** Static description of each check — also feeds dispatched compliance issues. */
export interface CheckMeta {
  label: string;
  /** What the check verifies, factually. */
  verifies: string;
  /** Suggested direction, derived from the check's nature — no speculation. */
  suggestion: string;
  /**
   * Lowercase fragments matched against the story's declared rule ids to find
   * a genuinely related rule. Empty means no real mapping exists — the
   * dispatched issue simply omits the "Governed by" line.
   */
  ruleKeywords: string[];
}

export const CHECK_META: Record<string, CheckMeta> = {
  "accessible-name": {
    label: "Buttons and links have an accessible name",
    verifies: "every button and link exposes a name to assistive technology",
    suggestion: "needs an accessible name — aria-label or visible text",
    ruleKeywords: ["accessible-label", "accessible-name", "aria-label"],
  },
  "img-alt": {
    label: "Images have an alt attribute",
    verifies: "every <img> declares alt text (empty alt = decorative)",
    suggestion:
      "add an alt attribute — descriptive text, or alt=\"\" for decorative images",
    ruleKeywords: ["img-alt", "alt-text"],
  },
  "field-labels": {
    label: "Form fields have a label",
    verifies: "every input, select and textarea has a programmatic label",
    suggestion:
      "associate a <label>, or add aria-label/aria-labelledby — a placeholder is not a label",
    ruleKeywords: ["field-label", "form-label", "input-label"],
  },
  "target-size": {
    label: "Interactive targets are ≥ 24×24px",
    verifies:
      "interactive targets meet the WCAG 2.2 minimum size (24×24 CSS px)",
    suggestion:
      "increase the target's hit area to at least 24×24px — padding counts toward it",
    ruleKeywords: ["target-size", "touch-target", "tap-target"],
  },
};

export type ChecksOutcome =
  | { ok: true; results: CheckResult[] }
  | { ok: false; error: string };

const PREVIEW_IFRAME_ID = "storybook-preview-iframe";
const MIN_TARGET_PX = 24;

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").trim().slice(0, 30);
  const cls = el.getAttribute("class")?.split(/\s+/)[0];
  return text ? `<${tag}> "${text}"` : cls ? `<${tag}.${cls}>` : `<${tag}>`;
}

function summarize(failures: string[]): string {
  const shown = failures.slice(0, 3).join(", ");
  return failures.length > 3
    ? `${shown} +${failures.length - 3} more`
    : shown;
}

function toResult(
  id: string,
  inspected: number,
  failures: string[],
  naNote: string,
): CheckResult {
  if (inspected === 0) return { id, status: "na", details: naNote };
  if (failures.length === 0)
    return { id, status: "pass", details: `${inspected} checked` };
  return { id, status: "fail", details: summarize(failures), failures };
}

function accessibleName(el: Element, doc: Document): string {
  const ariaLabel = el.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  const text = (el.textContent ?? "").trim();
  if (text) return text;
  const altImg = el.querySelector("img[alt]");
  const alt = altImg?.getAttribute("alt")?.trim();
  if (alt) return alt;
  if (el instanceof HTMLInputElement && el.value.trim()) return el.value.trim();
  return el.getAttribute("title")?.trim() ?? "";
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function runStoryChecks(): ChecksOutcome {
  const iframe = document.getElementById(
    PREVIEW_IFRAME_ID,
  ) as HTMLIFrameElement | null;
  const doc = iframe?.contentDocument ?? null;
  const root = doc?.getElementById("storybook-root") ?? doc?.body ?? null;
  if (!doc || !root) {
    return { ok: false, error: "Preview iframe not reachable — checks skipped." };
  }

  const results: CheckResult[] = [];

  // 1. Buttons and links have an accessible name.
  {
    const els = Array.from(
      root.querySelectorAll('button, a[href], [role="button"]'),
    ).filter(isVisible);
    const failures = els
      .filter((el) => !accessibleName(el, doc))
      .map((el) => `${describe(el)} — no accessible name`);
    results.push(
      toResult(
        "accessible-name",
        els.length,
        failures,
        "no buttons or links in this story",
      ),
    );
  }

  // 2. Images have an alt attribute (empty alt = decorative, still explicit).
  {
    const imgs = Array.from(root.querySelectorAll("img"));
    const failures = imgs
      .filter((img) => !img.hasAttribute("alt"))
      .map((img) => `${describe(img)} — missing alt attribute`);
    results.push(
      toResult("img-alt", imgs.length, failures, "no images in this story"),
    );
  }

  // 3. Form fields have a label.
  {
    const fields = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea',
      ),
    ).filter(isVisible);
    const failures = fields
      .filter((el) => {
        if (el.getAttribute("aria-label")?.trim()) return false;
        if (el.getAttribute("aria-labelledby")) return false;
        if (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`))
          return false;
        if (el.closest("label")) return false;
        return true; // placeholder alone is not a label
      })
      .map((el) => `${describe(el)} — no programmatic label`);
    results.push(
      toResult(
        "field-labels",
        fields.length,
        failures,
        "no form fields in this story",
      ),
    );
  }

  // 4. Interactive targets are at least 24×24 px (WCAG 2.2 minimum).
  //    Inline links inside text are exempt, per the SC's own exception.
  {
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea',
      ),
    )
      .filter(isVisible)
      .filter(
        (el) =>
          !(
            el.tagName === "A" &&
            doc.defaultView?.getComputedStyle(el).display === "inline"
          ),
      );
    const failures = targets
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width < MIN_TARGET_PX || rect.height < MIN_TARGET_PX;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${describe(el)} — ${Math.round(rect.width)}×${Math.round(rect.height)}px`;
      });
    results.push(
      toResult(
        "target-size",
        targets.length,
        failures,
        "no sizable targets in this story",
      ),
    );
  }

  return { ok: true, results };
}
