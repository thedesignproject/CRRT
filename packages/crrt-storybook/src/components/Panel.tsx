import { connectStorybook, clearScopedSession, subscribeScopedSessions } from "../auth";
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  useParameter,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { PARAM_KEY } from "../constants";
import { getInjectedCrrtParameters } from "../runtime-config";
import {
  fetchConnectionState,
  canSendFeedback,
  type ConnectionState,
} from "../connection";
import type { CrrtParameters, StoryContext } from "../types";
import { ComplianceSection } from "./ComplianceSection";
import { FeedbackSection } from "./FeedbackSection";
import { ConnectionNotice } from "./ConnectionNotice";

/**
 * The CRRT 🥕 panel. Two sections, in this order on purpose:
 *
 *   1. Compliance — the panel talks to stakeholders FROM the rules. A
 *      stakeholder opens Button and sees what governs it before they ask
 *      for anything.
 *   2. Feedback — the textarea + Send to CRRT, with the story's identity
 *      attached so the agent knows exactly what's being discussed.
 *
 * The story IS the context: no selectors, no clicking on elements — the
 * active story's id/title/name come straight from Storybook's API.
 */
export const Panel = () => {
  const api = useStorybookApi();
  const { storyId } = useStorybookState();
  const parameters = useParameter<CrrtParameters>(PARAM_KEY, {}) ?? {};
  const crrt = { ...getInjectedCrrtParameters(), ...parameters };
  const [connection, setConnection] = useState<ConnectionState>(() =>
    crrt.connectionId ? { kind: "connecting" } : { kind: "ready" },
  );

  const revision = useRef(0);
  const signingIn = useRef(false);
  const refreshConnection = useCallback(async () => {
    if (!crrt.connectionId) {
      setConnection({ kind: "ready" });
      return;
    }
    const current = ++revision.current;
    setConnection({ kind: "connecting" });
    const result = await fetchConnectionState({
        connectionId: crrt.connectionId,
        apiBase: crrt.apiBase,
      });
    if (current === revision.current) setConnection(result);
  }, [crrt.apiBase, crrt.connectionId]);

  useEffect(() => {
    void refreshConnection();
    const remove = subscribeScopedSessions(() => { void refreshConnection(); });
    const focus = () => { if (!signingIn.current) void refreshConnection(); };
    window.addEventListener("focus", focus);
    return () => { revision.current++; remove(); window.removeEventListener("focus", focus); };
  }, [refreshConnection]);

  const signIn = async () => {
    if (!crrt.connectionId || !crrt.projectId || signingIn.current) return;
    signingIn.current = true;
    revision.current++;
    setConnection({ kind: "connecting", message: "Finish signing in in the CRRT window…" });
    try {
      await connectStorybook({ connectionId: crrt.connectionId, projectId: crrt.projectId, apiBase: crrt.apiBase, dashboardUrl: crrt.dashboardUrl });
      await refreshConnection();
    } catch (error) {
      setConnection({ kind: "authentication_required", message: error instanceof Error ? error.message : "Sign in again." });
    } finally { signingIn.current = false; }
  };
  const feedbackReady = canSendFeedback(connection);

  const data = api.getCurrentStoryData();
  const story: StoryContext | null =
    storyId && data
      ? {
          storyId,
          componentTitle: data.title,
          storyName: data.name,
        }
      : null;

  if (!story) {
    return (
      <div style={styles.container}>
        <div style={styles.muted}>Select a story to talk to CRRT about it.</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <strong>🥕 {story.componentTitle}</strong>
          <span style={styles.muted}> · {story.storyName}</span>
        </div>
        {crrt.connectionId && (
          <span style={styles.connected}>
            <span
              style={{
                ...styles.connectedDot,
                background:
                  feedbackReady ? "#1d7a3e" : "#F26419",
              }}
              aria-hidden
            />
            {feedbackReady ? "Connected to CRRT" : "CRRT"}
          </span>
        )}
      </div>

      {crrt.connectionId && (
        <ConnectionNotice state={connection} onRetry={refreshConnection} onSignIn={signIn} />
      )}

      {crrt.connectionId && feedbackReady && (
        <button type="button" onClick={() => clearScopedSession({ connectionId: crrt.connectionId!, apiBase: crrt.apiBase })} style={{ marginBottom: 12, cursor: "pointer" }}>Sign out of this Storybook</button>
      )}

      <ComplianceSection
        story={story}
        rules={crrt.rules ?? []}
        checksEnabled={crrt.checks !== false}
        projectId={feedbackReady ? crrt.projectId : undefined}
        connectionId={crrt.connectionId}
        apiBase={crrt.apiBase}
        dashboardUrl={crrt.dashboardUrl}
      />

      <hr style={styles.divider} />

      <FeedbackSection
        story={story}
        projectId={crrt.projectId}
        connectionId={crrt.connectionId}
        connectionState={connection}
        apiBase={crrt.apiBase}
        dashboardUrl={crrt.dashboardUrl}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: 720,
  },
  header: {
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  connected: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    opacity: 0.72,
    whiteSpace: "nowrap",
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  muted: { opacity: 0.6 },
  divider: {
    border: "none",
    borderTop: "1px solid rgba(0,0,0,0.1)",
    margin: "14px 0",
  },
};
