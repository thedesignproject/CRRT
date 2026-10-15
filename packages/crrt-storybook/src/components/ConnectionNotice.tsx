import React from "react";
import {
  connectionStateMessage,
  type ConnectionState,
} from "../connection";
import { CRRT_ORANGE } from "../constants";

interface ConnectionNoticeProps {
  state: ConnectionState;
  onRetry: () => void;
  onSignIn: () => void;
}

export const ConnectionNotice = ({
  state,
  onRetry,
  onSignIn,
}: ConnectionNoticeProps) => {
  if (state.kind === "ready" || state.code === "forbidden") return null;
  const isError = state.kind === "offline_error";
  const actionLabel =
    state.kind === "upgrade_required"
      ? "View CRRT Pro"
      : state.kind === "seat_limit_reached"
        ? "Manage seats"
        : state.kind === "authentication_required" ||
            state.kind === "session_expired"
          ? "Sign in to CRRT"
          : "Open CRRT";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      style={{
        ...styles.notice,
        borderLeftColor: isError ? "#b42318" : CRRT_ORANGE,
      }}
    >
      <span style={styles.message}>
        {state.message ?? connectionStateMessage(state.kind)}
      </span>
      {(state.kind === "authentication_required" || state.kind === "session_expired" || state.kind === "access_denied") && (
        <button type="button" onClick={onSignIn} style={{ ...styles.retry, ...styles.action }}>Sign in to CRRT</button>
      )}
      {state.actionUrl &&
      state.kind !== "connecting" &&
      state.kind !== "offline_error" ? (
        <a
          href={state.actionUrl}
          target="_blank"
          rel="noreferrer"
          style={styles.action}
        >
          {actionLabel}
        </a>
      ) : null}
      {isError ? (
        <button type="button" onClick={onRetry} style={styles.retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 28,
    padding: "6px 9px",
    marginBottom: 14,
    borderLeft: "3px solid",
    background: "rgba(128,128,128,0.08)",
    fontSize: 12,
  },
  message: { flex: 1, minWidth: 0 },
  action: {
    color: CRRT_ORANGE,
    fontWeight: 650,
    whiteSpace: "nowrap",
  },
  retry: {
    border: "1px solid rgba(128,128,128,0.35)",
    background: "transparent",
    color: "inherit",
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
};
