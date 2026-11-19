import React, { useState } from "react";
import { useStorybookApi } from "storybook/manager-api";

interface CarrotPanelProps {
  active: boolean;
}

type SendStatus = "idle" | "sending" | "sent" | "error";

const CRRT_ORANGE = "#F26419";
// CRRT's brand font. Loaded into the Storybook manager via .storybook/manager-head.html.
const CRRT_FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * The "🥕 Crrt" panel — the Carrot feedback-loop entry point.
 *
 * A stakeholder leaves feedback on the current component, and the panel sends it
 * to CRRT as a project comment (`POST {apiBase}/v1/public/comments`).
 *
 * Sending is where this panel's job ends. Nothing here opens a PR and nothing
 * here starts an agent: a reviewer accepts the comment in the CRRT dashboard,
 * creates a feedback share, and hands its prompt to an agent session running in
 * this repo. See LOOP.md for the full wiring and the pieces still missing.
 *
 * Configure via env (Storybook exposes `STORYBOOK_*` vars):
 *   STORYBOOK_CRRT_PROJECT_ID   the CRRT project public key (required to send)
 *   STORYBOOK_CRRT_API_BASE     backend base URL (default https://crrt.ai/api)
 *
 * Without a project id the panel stays inert and says so — it never breaks Storybook.
 */
function readEnv(key: string): string | undefined {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    if (meta.env && meta.env[key] != null) return meta.env[key];
  } catch {
    /* import.meta.env not available in this builder */
  }
  try {
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return process.env[key];
    }
  } catch {
    /* process not available */
  }
  return undefined;
}

const PROJECT_ID = readEnv("STORYBOOK_CRRT_PROJECT_ID");
// Treat an empty string as unset (copying .env.example verbatim yields "",
// which `??` would not catch) so it never overrides the default base URL.
const API_BASE = (readEnv("STORYBOOK_CRRT_API_BASE")?.trim() || "https://crrt.ai/api").replace(/\/$/, "");

export const CarrotPanel = ({ active }: CarrotPanelProps) => {
  const api = useStorybookApi();
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const story = api.getCurrentStoryData?.() as { id?: string; title?: string; name?: string } | undefined;
  const componentLabel = story?.title
    ? `${story.title}${story.name ? ` / ${story.name}` : ""}`
    : "the current component";

  const canSend = feedback.trim().length > 0 && status !== "sending";

  const send = async () => {
    if (!PROJECT_ID || feedback.trim().length === 0) return;
    setStatus("sending");
    setError(null);
    try {
      // The public comments API requires pageUrl, selector, body and finite x/y.
      // There is no real pin here (no widget), so identify the component by its
      // story and send 0/0 placeholder coordinates.
      const pageUrl =
        (typeof window !== "undefined" && window.location.href) || `storybook:${story?.id ?? "unknown"}`;
      const selector = `[data-storybook-story="${story?.id ?? "unknown"}"]`;
      const res = await fetch(`${API_BASE}/v1/public/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: PROJECT_ID,
          pageUrl,
          selector,
          x: 0,
          y: 0,
          body: feedback.trim(),
        }),
      });
      if (!res.ok) throw new Error(`CRRT responded ${res.status}`);
      setStatus("sent");
      setFeedback("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to reach CRRT");
    }
  };

  if (!active) return null;

  // Disabled view — no CRRT project id configured. Nothing to send to, so show a
  // friendly setup notice instead of an inert form.
  if (!PROJECT_ID) {
    return (
      <div
        style={{
          padding: 24,
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: CRRT_FONT,
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1 }} role="img" aria-label="carrot">
          🥕
        </div>
        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>CRRT isn’t configured</div>
        {/* Inherit the theme's text color (visible in light/dark); dim via opacity, never a hard black. */}
        <p style={{ marginTop: 6, maxWidth: 340, opacity: 0.7 }}>
          Set <code>STORYBOOK_CRRT_PROJECT_ID</code> in your environment to connect this panel
          to your CRRT project.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontSize: 13, lineHeight: 1.5, fontFamily: CRRT_FONT }}>
      <div style={{ marginBottom: 12 }}>
        <strong>🥕 CRRT</strong> — leave stakeholder feedback on <em>{componentLabel}</em>.
      </div>

      <textarea
        value={feedback}
        onChange={(e) => {
          setFeedback(e.target.value);
          if (status !== "idle") setStatus("idle");
        }}
        placeholder="e.g. Make the primary button a bit more prominent…"
        rows={4}
        disabled={status === "sending"}
        style={{
          width: "100%",
          padding: 8,
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.15)",
          fontFamily: "inherit",
          fontSize: 13,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: CRRT_ORANGE,
            color: "white",
            cursor: canSend ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: 13,
            opacity: canSend ? 1 : 0.5,
          }}
        >
          {status === "sending" ? "Sending…" : "Send to Carrot"}
        </button>

        {/* Don't promise a PR: the handoff to an agent runs through the CRRT
            dashboard, not from this panel. See LOOP.md. */}
        {status === "sent" && (
          <span style={{ color: "#2e7d32", fontSize: 12 }}>✓ Sent to CRRT — review it in the dashboard.</span>
        )}
        {status === "error" && (
          <span style={{ color: "#c62828", fontSize: 12 }}>Couldn’t send{error ? `: ${error}` : ""}.</span>
        )}
      </div>
    </div>
  );
};
