import { dashboardHome } from "../auth";
import React, { useEffect, useState } from "react";
import { sendFeedback } from "../api";
import { captureStoryScreenshot } from "../screenshot";
import {
  AUTHOR_STORAGE_KEY,
  CRRT_ORANGE,
  DEFAULT_DASHBOARD_URL,
} from "../constants";
import type { StoryContext } from "../types";
import type { ConnectionState } from "../connection";
import { connectionStateMessage, canSendFeedback } from "../connection";

interface FeedbackSectionProps {
  story: StoryContext;
  projectId?: string;
  connectionId?: string;
  connectionState?: ConnectionState;
  apiBase?: string;
  dashboardUrl?: string;
}

type SendState =
  | { kind: "idle" }
  | { kind: "capturing" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/** The collect layer: textarea + "Send to CRRT", with story metadata attached. */
export const FeedbackSection = ({
  story,
  projectId,
  connectionId,
  connectionState,
  apiBase,
  dashboardUrl = DEFAULT_DASHBOARD_URL,
}: FeedbackSectionProps) => {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(
    () => window.localStorage.getItem(AUTHOR_STORAGE_KEY) ?? "",
  );
  const [state, setState] = useState<SendState>({ kind: "idle" });

  // A new story is a new conversation — clear the sent state, keep a draft.
  useEffect(() => {
    setState({ kind: "idle" });
  }, [story.storyId]);

  if (!projectId) {
    return (
      <section>
        <h3 style={styles.heading}>Feedback</h3>
        <div style={styles.muted}>
          Connect this Storybook from your CRRT Pro project, then restart
          Storybook. For manual development, configure{" "}
          <code style={styles.code}>parameters.crrt.projectId</code>.
        </div>
      </section>
    );
  }

  if (connectionId && (!connectionState || !canSendFeedback(connectionState))) {
    return (
      <section>
        <h3 style={styles.heading}>Feedback</h3>
        <div style={styles.muted}>
          {connectionState?.message ??
            connectionStateMessage(connectionState?.kind ?? "connecting")}
        </div>
      </section>
    );
  }

  const send = async () => {
    if (!text.trim() || state.kind === "capturing" || state.kind === "sending") return;
    try {
      setState({ kind: "capturing" });
      const screenshot = await captureStoryScreenshot();
      setState({ kind: "sending" });
      window.localStorage.setItem(AUTHOR_STORAGE_KEY, author.trim());
      const result = await sendFeedback({
        projectId,
        connectionId,
        apiBase,
        body: text,
        authorName: author,
        screenshot,
        story,
      });
      if (result.ok) {
        setText("");
        setState({ kind: "sent" });
      } else {
        setState({ kind: "error", message: result.error });
      }
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The story screenshot could not be captured",
      });
    }
  };

  const busy = state.kind === "capturing" || state.kind === "sending";

  return (
    <section>
      <h3 style={styles.heading}>Feedback</h3>

      {state.kind === "sent" ? (
        <div style={styles.sentBox}>
          <div style={{ fontWeight: 600 }}>Sent to CRRT ✓</div>
          <div style={{ ...styles.muted, margin: "4px 0 8px" }}>
            Your feedback on <strong>{story.componentTitle}</strong> ·{" "}
            {story.storyName} is on its way to the agent.
          </div>
          <a href={dashboardHome(dashboardUrl)} target="_blank" rel="noreferrer" style={styles.link}>
            Open the CRRT dashboard ↗
          </a>
          <button
            onClick={() => setState({ kind: "idle" })}
            style={styles.secondary}
          >
            Send another
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Make the primary button a bit more prominent…"
            rows={4}
            aria-label="Feedback for this component"
            style={styles.textarea}
          />
          <div style={styles.footer}>
            {!connectionId ? (
              <label style={styles.authorField}>
                <span style={styles.authorLabel}>Posting as</span>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name (optional)"
                  maxLength={80}
                  style={styles.name}
                />
              </label>
            ) : (
              <span style={styles.captureNote}>Includes a story screenshot</span>
            )}
            <button
              onClick={send}
              disabled={!text.trim() || busy}
              style={{
                ...styles.send,
                opacity: !text.trim() || busy ? 0.6 : 1,
              }}
            >
              {state.kind === "capturing"
                ? "Capturing…"
                : state.kind === "sending"
                  ? "Sending…"
                  : "Send to CRRT"}
            </button>
          </div>
          {state.kind === "error" && (
            <div style={styles.error}>
              Couldn't send: {state.message}. Try again?
            </div>
          )}
        </>
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
  muted: { opacity: 0.6 },
  code: {
    background: "rgba(0,0,0,0.06)",
    padding: "1px 4px",
    borderRadius: 3,
    fontSize: 12,
  },
  textarea: {
    width: "100%",
    padding: 8,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.15)",
    fontFamily: "inherit",
    fontSize: 13,
    resize: "vertical",
    boxSizing: "border-box",
    background: "transparent",
    color: "inherit",
  },
  footer: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  authorField: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  authorLabel: {
    fontSize: 11,
    opacity: 0.58,
    whiteSpace: "nowrap",
  },
  name: {
    width: 180,
    maxWidth: "42vw",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.15)",
    fontFamily: "inherit",
    fontSize: 12,
    background: "transparent",
    color: "inherit",
  },
  captureNote: { fontSize: 11, opacity: 0.58 },
  send: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    background: CRRT_ORANGE,
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  sentBox: {
    border: "1px solid rgba(46,164,79,0.35)",
    background: "rgba(46,164,79,0.08)",
    borderRadius: 6,
    padding: "10px 12px",
  },
  link: { color: CRRT_ORANGE, fontWeight: 600, marginRight: 12 },
  secondary: {
    border: "1px solid rgba(0,0,0,0.15)",
    background: "transparent",
    borderRadius: 4,
    padding: "2px 10px",
    fontSize: 12,
    cursor: "pointer",
    color: "inherit",
  },
  error: { color: "#b42318", marginTop: 6 },
};
