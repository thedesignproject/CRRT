import { getScopedToken, clearScopedSession } from "./auth";
import { DEFAULT_API_BASE } from "./constants";
import { MAX_SCREENSHOT_BASE64_LENGTH, type StoryScreenshot } from "./screenshot";
import type { StoryContext } from "./types";

export interface SendFeedbackInput {
  projectId: string;
  /** Present for CRRT Pro connections. Private sends never fall back to public. */
  connectionId?: string;
  apiBase?: string;
  /** The stakeholder's feedback text. */
  body: string;
  authorName?: string;
  screenshot?: StoryScreenshot;
  story: StoryContext;
}

export type SendFeedbackResult =
  | { ok: true; commentId?: string }
  | { ok: false; error: string };

const MAX_ELEMENT_LINES = 5;

/**
 * Composes the structured body for a dispatched compliance issue. Read by the
 * agent and by humans in the dashboard, so it is a compact labeled block; the
 * standard story-context footer is appended by sendFeedback like any comment.
 */
export function composeComplianceBody(input: {
  checkLabel: string;
  verifies: string;
  failures: string[];
  suggestion: string;
  story: StoryContext;
  ruleId?: string;
}): string {
  const lines = [
    `[compliance issue] ${input.checkLabel} — check failed`,
    `Checks: ${input.verifies}`,
    `Story: ${input.story.componentTitle} · ${input.story.storyName}`,
    ...input.failures
      .slice(0, MAX_ELEMENT_LINES)
      .map((f) => `Element: ${f}`),
  ];
  if (input.failures.length > MAX_ELEMENT_LINES) {
    lines.push(`(+${input.failures.length - MAX_ELEMENT_LINES} more elements)`);
  }
  if (input.ruleId) lines.push(`Governed by: ${input.ruleId}`);
  lines.push(`Suggested: ${input.suggestion}`);
  return lines.join("\n");
}

/**
 * Posts a comment to the hosted CRRT API (POST {apiBase}/v1/public/comments).
 *
 * The endpoint accepts a fixed field list (projectKey, pageUrl, selector, x, y,
 * body, authorName) — arbitrary metadata keys are dropped server-side. Story
 * context therefore rides the existing fields:
 *   - pageUrl:  deep link back to the story in this Storybook
 *   - selector: `storybook://<storyId>` (machine-parseable in the `element` column)
 *   - body:     feedback text + a one-line story-context footer for the agent
 *   - x/y:      required finite numbers; synthetic (50,50) — a panel has no click point
 */
export async function sendFeedback(
  input: SendFeedbackInput,
): Promise<SendFeedbackResult> {
  const apiBase = (input.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const { storyId, componentTitle, storyName } = input.story;

  const pageUrl = `${window.location.origin}${window.location.pathname}?path=/story/${storyId}`;
  const footer = `— via Storybook · component: ${componentTitle} · story: ${storyName} · id: ${storyId}`;

  const payload: Record<string, unknown> = {
    projectKey: input.projectId,
    pageUrl,
    selector: `storybook://${storyId}`,
    x: 50,
    y: 50,
    body: `${input.body.trim()}\n\n${footer}`,
  };
  const authorName = input.authorName?.trim();
  if (authorName) {
    payload.authorName = authorName.slice(0, 80);
  }
  if (input.screenshot && input.screenshot.base64.length <= MAX_SCREENSHOT_BASE64_LENGTH) {
    payload.imageBase64 = input.screenshot.base64;
    payload.imageMimeType = input.screenshot.mimeType;
  }

  try {
    const endpoint = input.connectionId
      ? `${apiBase}/v1/storybook/connections/${encodeURIComponent(input.connectionId)}/comments`
      : `${apiBase}/v1/public/comments`;
    const token = input.connectionId ? getScopedToken({ connectionId: input.connectionId, apiBase }) : undefined;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      ...(input.connectionId ? { credentials: "omit" as const } : {}),
    });
    if (!res.ok) {
      if (input.connectionId && token && (res.status === 401 || res.status === 419)) clearScopedSession({ connectionId: input.connectionId, apiBase }, token);
      const data = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      return {
        ok: false,
        error: data?.message ?? `CRRT API returned ${res.status}`,
      };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, commentId: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
