import { dashboardHome } from "../auth";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "storybook/manager-api";
import { STORY_RENDERED } from "storybook/internal/core-events";
import { composeComplianceBody, sendFeedback } from "../api";
import { CRRT_ORANGE, DEFAULT_DASHBOARD_URL } from "../constants";
import {
  CHECK_META,
  runStoryChecks,
  type CheckResult,
  type ChecksOutcome,
} from "../checks";
import type { CrrtRule, CrrtRuleStatus, StoryContext } from "../types";
import { tryCaptureStoryScreenshot } from "../screenshot";

const STATUS_BADGE: Record<
  CrrtRuleStatus,
  { label: string; color: string; bg: string }
> = {
  info: { label: "governs", color: "#8a6d1d", bg: "rgba(242,169,0,0.12)" },
  pass: { label: "pass", color: "#1d7a3e", bg: "rgba(46,164,79,0.12)" },
  warn: { label: "warn", color: "#8a6d1d", bg: "rgba(242,169,0,0.12)" },
  fail: { label: "fail", color: "#b42318", bg: "rgba(212,44,30,0.12)" },
};

const CHECK_ICON: Record<string, string> = { pass: "✓", fail: "✕", na: "–" };
// Mid-grey stays readable on both the light and dark Storybook themes;
// pure-black rgba turns invisible on the dark panel background.
const CHECK_COLOR: Record<string, string> = {
  pass: "#1d7a3e",
  fail: "#b42318",
  na: "rgba(128,128,128,0.9)",
};

/**
 * Failed checks already dispatched this session (manager page lifetime),
 * keyed by `${storyId}:${checkId}` — survives switching stories so the same
 * issue isn't sent twice.
 */
const dispatchedThisSession = new Set<string>();

type DispatchState = "capturing" | "sending" | "sent" | "error";

/** A check maps to a declared rule only when the relationship is real. */
function matchRule(rules: CrrtRule[], checkId: string): CrrtRule | undefined {
  const keywords = CHECK_META[checkId]?.ruleKeywords ?? [];
  return rules.find((r) =>
    keywords.some((k) => r.id.toLowerCase().includes(k)),
  );
}

interface ComplianceSectionProps {
  story: StoryContext;
  rules: CrrtRule[];
  checksEnabled: boolean;
  projectId?: string;
  connectionId?: string;
  apiBase?: string;
  dashboardUrl?: string;
}

/**
 * The proactive layer: what governs this component, shown before anything is
 * asked. Rule cards are informational (v1); the checklist runs real DOM checks
 * against the rendered story — and every failure is one click away from being
 * dispatched to CRRT as a structured issue.
 */
export const ComplianceSection = ({
  story,
  rules,
  checksEnabled,
  projectId,
  connectionId,
  apiBase,
  dashboardUrl = DEFAULT_DASHBOARD_URL,
}: ComplianceSectionProps) => {
  const [checks, setChecks] = useState<ChecksOutcome | null>(null);
  const [dispatch, setDispatch] = useState<Record<string, DispatchState>>({});
  const scheduledFrames = useRef<number[]>([]);

  const refresh = useCallback(() => {
    if (checksEnabled) setChecks(runStoryChecks());
  }, [checksEnabled]);

  const cancelScheduledRefresh = useCallback(() => {
    scheduledFrames.current.forEach((frame) => cancelAnimationFrame(frame));
    scheduledFrames.current = [];
  }, []);

  // STORY_RENDERED can fire before the iframe has completed layout. Waiting
  // for two frames keeps real elements from being misreported as “not in story”.
  const refreshAfterLayout = useCallback(() => {
    cancelScheduledRefresh();
    if (!checksEnabled) return;
    setChecks(null);
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        scheduledFrames.current = [];
        refresh();
      });
      scheduledFrames.current.push(second);
    });
    scheduledFrames.current.push(first);
  }, [cancelScheduledRefresh, checksEnabled, refresh]);

  useChannel({ [STORY_RENDERED]: refreshAfterLayout });
  useEffect(() => {
    setDispatch({});
    refreshAfterLayout();
    return cancelScheduledRefresh;
  }, [cancelScheduledRefresh, refreshAfterLayout, story.storyId]);

  const dispatchIssue = async (check: CheckResult) => {
    const meta = CHECK_META[check.id];
    if (
      !projectId ||
      !meta ||
      dispatch[check.id] === "capturing" ||
      dispatch[check.id] === "sending"
    ) return;
    try {
      setDispatch((s) => ({ ...s, [check.id]: "capturing" }));
      const screenshot = await tryCaptureStoryScreenshot();
      setDispatch((s) => ({ ...s, [check.id]: "sending" }));
      const result = await sendFeedback({
        projectId,
        connectionId,
        apiBase,
        body: composeComplianceBody({
          checkLabel: meta.label,
          verifies: meta.verifies,
          failures: check.failures ?? [],
          suggestion: meta.suggestion,
          story,
          ruleId: matchRule(rules, check.id)?.id,
        }),
        screenshot,
        story,
      });
      if (result.ok) dispatchedThisSession.add(`${story.storyId}:${check.id}`);
      setDispatch((s) => ({ ...s, [check.id]: result.ok ? "sent" : "error" }));
    } catch {
      setDispatch((s) => ({ ...s, [check.id]: "error" }));
    }
  };

  const renderAction = (check: CheckResult) => {
    if (check.status !== "fail" || !projectId) return null;
    const state = dispatch[check.id];
    if (state === "sent") {
      return (
        <span style={styles.sentInline}>
          Sent ✓ —{" "}
          <a href={dashboardHome(dashboardUrl)} target="_blank" rel="noreferrer" style={styles.sentLink}>
            view in dashboard
          </a>
        </span>
      );
    }
    if (dispatchedThisSession.has(`${story.storyId}:${check.id}`)) {
      return (
        <button disabled style={{ ...styles.dispatch, ...styles.dispatchDisabled }}>
          Already sent
        </button>
      );
    }
    return (
      <>
        {state === "error" && <span style={styles.errorInline}>failed —</span>}
        <button
          onClick={() => dispatchIssue(check)}
          disabled={state === "capturing" || state === "sending"}
          style={{
            ...styles.dispatch,
            opacity: state === "capturing" || state === "sending" ? 0.6 : 1,
          }}
        >
          {state === "capturing"
            ? "Capturing…"
            : state === "sending"
              ? "Sending…"
              : state === "error"
                ? "Retry"
                : "Send to CRRT"}
        </button>
      </>
    );
  };

  return (
    <section>
      <h3 style={styles.heading}>Compliance</h3>

      {rules.length === 0 ? (
        <div style={styles.muted}>
          No governance rules declared for this story. Add them via{" "}
          <code style={styles.code}>parameters.crrt.rules</code>.
        </div>
      ) : (
        <div style={styles.cards}>
          {rules.map((rule) => {
            const badge = STATUS_BADGE[rule.status ?? "info"];
            return (
              <div key={rule.id} style={styles.card}>
                <div style={styles.cardHead}>
                  {rule.href ? (
                    <a href={rule.href} target="_blank" rel="noreferrer" style={styles.ruleId}>
                      {rule.id}
                    </a>
                  ) : (
                    <span style={styles.ruleId}>{rule.id}</span>
                  )}
                  <span
                    style={{
                      ...styles.badge,
                      color: badge.color,
                      background: badge.bg,
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
                <div>{rule.essence}</div>
              </div>
            );
          })}
        </div>
      )}

      {checksEnabled && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.checksHead}>
            <span style={styles.subheading}>Built-in checks (this story's DOM)</span>
            <button onClick={refreshAfterLayout} style={styles.rerun} title="Re-run checks">
              ↻ re-run
            </button>
          </div>
          {!checks ? (
            <div style={styles.muted}>Waiting for the story to render…</div>
          ) : !checks.ok ? (
            <div style={styles.muted}>{checks.error}</div>
          ) : (
            <ul style={styles.checkList}>
              {checks.results.map((c) => (
                <li key={c.id} style={styles.checkItem}>
                  <span
                    style={{ ...styles.checkIcon, color: CHECK_COLOR[c.status] }}
                    aria-hidden
                  >
                    {CHECK_ICON[c.status]}
                  </span>
                  <span
                    style={{
                      ...styles.checkLabel,
                      ...(c.status === "na" ? styles.mutedInline : null),
                    }}
                  >
                    {CHECK_META[c.id]?.label ?? c.id}
                    {c.details && (
                      <span style={styles.details}> — {c.details}</span>
                    )}
                  </span>
                  {renderAction(c)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    opacity: 0.6,
    margin: "0 0 8px",
  },
  subheading: { fontWeight: 600, fontSize: 12, opacity: 0.75 },
  muted: { opacity: 0.6 },
  mutedInline: { opacity: 0.55 },
  code: {
    background: "rgba(0,0,0,0.06)",
    padding: "1px 4px",
    borderRadius: 3,
    fontSize: 12,
  },
  cards: { display: "flex", flexDirection: "column", gap: 6 },
  card: {
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 6,
    padding: "8px 10px",
    background: "rgba(0,0,0,0.02)",
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 2,
  },
  ruleId: {
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    fontWeight: 600,
    color: "inherit",
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "1px 6px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  checksHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  rerun: {
    border: "1px solid rgba(0,0,0,0.15)",
    background: "transparent",
    borderRadius: 4,
    padding: "1px 8px",
    fontSize: 11,
    cursor: "pointer",
    color: "inherit",
  },
  checkList: { listStyle: "none", margin: 0, padding: 0 },
  checkItem: {
    display: "flex",
    gap: 6,
    padding: "3px 0",
    alignItems: "baseline",
  },
  checkIcon: { fontWeight: 700, width: 12, flexShrink: 0 },
  checkLabel: { flex: 1, minWidth: 0 },
  details: { opacity: 0.6, fontSize: 12 },
  dispatch: {
    border: "none",
    background: CRRT_ORANGE,
    color: "white",
    borderRadius: 4,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  dispatchDisabled: {
    background: "rgba(128,128,128,0.18)",
    border: "1px solid rgba(128,128,128,0.35)",
    color: "inherit",
    opacity: 0.8,
    cursor: "default",
  },
  sentInline: {
    fontSize: 12,
    color: "#1d7a3e",
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  sentLink: { color: CRRT_ORANGE, fontWeight: 600 },
  errorInline: { color: "#b42318", fontSize: 11, whiteSpace: "nowrap" },
};
