import { getScopedToken, clearScopedSession } from "./auth";
import { DEFAULT_API_BASE } from "./constants";

export type ConnectionStateKind =
  | "connecting"
  | "authentication_required"
  | "ready"
  | "access_denied"
  | "upgrade_required"
  | "seat_limit_reached"
  | "session_expired"
  | "offline_error";

export interface ConnectionState {
  kind: ConnectionStateKind;
  message?: string;
  actionUrl?: string;
  code?: string;
}

const SERVER_STATES = new Set<ConnectionStateKind>([
  "authentication_required",
  "ready",
  "access_denied",
  "upgrade_required",
  "seat_limit_reached",
  "session_expired",
]);

function stateFromError(status: number, code?: string): ConnectionStateKind {
  const aliases: Record<string, ConnectionStateKind> = {
    signed_out: "authentication_required",
    project_access_denied: "access_denied",
    forbidden: "access_denied",
    owner_upgrade_required: "upgrade_required",
  };
  if (code && aliases[code]) return aliases[code];
  if (code && SERVER_STATES.has(code as ConnectionStateKind)) {
    return code as ConnectionStateKind;
  }
  if (status === 401) return "authentication_required";
  if (status === 402) return "upgrade_required";
  if (status === 403) return "access_denied";
  if (status === 419) return "session_expired";
  return "offline_error";
}

function safeActionUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (local && url.protocol === "http:")
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchConnectionState(
  input: { connectionId: string; apiBase?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionState> {
  const apiBase = (input.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  try {
    const token = getScopedToken(input);
    const response = await fetchImpl(
      `${apiBase}/v1/storybook/connections/${encodeURIComponent(input.connectionId)}/eligibility`,
      { credentials: "omit", headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    const data = (await response.json().catch(() => null)) as {
      state?: string;
      code?: string;
      message?: string;
      actionUrl?: string;
    } | null;
    if (response.ok && data?.state && SERVER_STATES.has(data.state as ConnectionStateKind)) {
      return {
        kind: data.state as ConnectionStateKind,
        message: data.message,
        actionUrl: safeActionUrl(data.actionUrl),
      };
    }
    if (token && (response.status === 401 || response.status === 419)) clearScopedSession(input, token);
    return {
      ...(data?.code ? { code: data.code } : {}),
      kind: stateFromError(response.status, data?.code),
      message: data?.message,
      actionUrl: safeActionUrl(data?.actionUrl),
    };
  } catch {
    return { kind: "offline_error" };
  }
}

export function connectionStateMessage(state: ConnectionStateKind): string {
  switch (state) {
    case "connecting":
      return "Checking your CRRT access…";
    case "authentication_required":
      return "Sign in to CRRT to send private feedback.";
    case "access_denied":
      return "This CRRT project isn't available to your account.";
    case "upgrade_required":
      return "Storybook is included with CRRT Pro.";
    case "seat_limit_reached":
      return "This project's CRRT seats are full. Ask the owner to manage seats.";
    case "session_expired":
      return "Your CRRT session expired. Sign in again to continue.";
    case "offline_error":
      return "CRRT couldn't verify access. Check your connection and try again.";
    case "ready":
      return "Connected to CRRT Pro.";
  }
}

export function canSendFeedback(state: ConnectionState) {
  return state.kind === "ready" || state.code === "forbidden";
}
