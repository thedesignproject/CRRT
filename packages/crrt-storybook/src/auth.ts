import { DEFAULT_API_BASE, DEFAULT_DASHBOARD_URL } from "./constants";

export interface AuthConnection {
  connectionId: string;
  projectId: string;
  apiBase?: string;
  dashboardUrl?: string;
}
type Session = { accessToken: string; expiresAt: string; displayName: string };
const sessions = new Map<string, Session>();
const listeners = new Set<() => void>();
const proof = /^[A-Za-z0-9_-]{43}$/;
const key = (input: { connectionId: string; apiBase?: string }) =>
  `${(input.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "")}|${input.connectionId}`;
function changed() { for (const listener of listeners) listener(); }
export function subscribeScopedSessions(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function clearScopedSession(input: { connectionId: string; apiBase?: string }, expectedToken?: string) {
  if (expectedToken !== undefined && sessions.get(key(input))?.accessToken !== expectedToken) return;
  if (sessions.delete(key(input))) changed();
}
export function getScopedToken(input: { connectionId: string; apiBase?: string }): string | undefined {
  const session = sessions.get(key(input));
  if (!session) return undefined;
  if (Date.parse(session.expiresAt) <= Date.now()) { clearScopedSession(input); return undefined; }
  return session.accessToken;
}
function safeUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use an HTTPS CRRT URL or a local development server.");
  }
  return url;
}
export function dashboardHome(value = DEFAULT_DASHBOARD_URL) {
  const url = safeUrl(value);
  const path = url.pathname.replace(/\/$/, "");
  url.pathname = path.endsWith("/dashboard") ? `${path}/` : `${path}/dashboard/`;
  return url.href;
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Open synchronously from a user click. Account credentials stay in CRRT. */
export async function connectStorybook(input: AuthConnection): Promise<void> {
  const dashboard = safeUrl(input.dashboardUrl ?? DEFAULT_DASHBOARD_URL);
  const apiBase = safeUrl(input.apiBase ?? DEFAULT_API_BASE).href.replace(/\/+$/, "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.connectionId) || !input.projectId) {
    throw new Error("Connect this Storybook to a CRRT project first.");
  }
  const popup = window.open("about:blank", "_blank", "popup,width=520,height=720");
  if (!popup) throw new Error("Allow popups for this Storybook, then sign in again.");
  try {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const codeChallenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const target = new URL("/dashboard/widget-auth", dashboard.origin);
    target.search = new URLSearchParams({ projectKey: input.projectId, connectionId: input.connectionId, origin: window.location.origin, state, codeChallenge }).toString();
    const code = await new Promise<string>((resolve, reject) => {
      const finish = (error?: Error, value?: string) => {
        window.removeEventListener("message", receive);
        clearTimeout(timeout);
        clearInterval(closed);
        error ? reject(error) : resolve(value!);
      };
      const receive = (event: MessageEvent) => {
        if (event.origin !== dashboard.origin || event.source !== popup || !event.data ||
          event.data.type !== "crrt:storybook-auth" || event.data.state !== state || typeof event.data.code !== "string" || !proof.test(event.data.code)) return;
        finish(undefined, event.data.code);
      };
      const timeout = setTimeout(() => finish(new Error("Sign-in timed out. Try again.")), 5 * 60_000);
      const closed = setInterval(() => { if (popup.closed) finish(new Error("Sign-in was closed. Try again.")); }, 500);
      window.addEventListener("message", receive);
      popup.location.replace(target.href);
    });
    const response = await fetch(`${apiBase}/v1/storybook/auth/exchange`, {
      method: "POST", credentials: "omit", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: input.connectionId, code, state, verifier }),
    });
    const result = await response.json() as Partial<Session> & { message?: string };
    if (!response.ok) throw new Error(result.message ?? "Could not sign in to CRRT.");
    if (typeof result.accessToken !== "string" || !/^crrt_widget_[A-Za-z0-9_-]{43}$/.test(result.accessToken) ||
      typeof result.displayName !== "string" || typeof result.expiresAt !== "string" || !(Date.parse(result.expiresAt) > Date.now())) {
      throw new Error("CRRT returned an invalid session. Sign in again.");
    }
    sessions.set(key(input), result as Session);
    changed();
  } finally { popup.close(); }
}
