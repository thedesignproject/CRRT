import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { connectStorybook, clearScopedSession, getScopedToken, subscribeScopedSessions, fetchConnectionState, sendFeedback, canSendFeedback, dashboardHome } from '../dist/index.js';
const input = { connectionId: '11111111-1111-4111-8111-111111111111', projectId: 'project', apiBase: 'http://127.0.0.1:3193/api', dashboardUrl: 'http://127.0.0.1:4328' };
const token = `crrt_widget_${'t'.repeat(43)}`;
function browser(onNavigate, response = { accessToken: token, displayName: 'Ada', expiresAt: new Date(Date.now() + 3600000).toISOString() }) {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const handlers = new Set(), calls = [];
  let target;
  const popup = { closed: false, close() { this.closed = true; }, location: { replace(url) { target = new URL(url); queueMicrotask(() => onNavigate?.(target, popup, emit)); } } };
  function emit(data, origin = input.dashboardUrl, source = popup) { for (const handler of [...handlers]) handler({ origin, source, data }); }
  globalThis.window = { location: { origin: 'http://localhost:6007', pathname: '/' }, open: () => popup, addEventListener(_name, fn) { handlers.add(fn); }, removeEventListener(_name, fn) { handlers.delete(fn); } };
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(response); };
  return { calls, popup, handlers, get target() { return target; }, restore() { clearScopedSession(input); globalThis.window = originalWindow; globalThis.fetch = originalFetch; } };
}
const complete = (url, _popup, emit) => emit({ type: 'crrt:storybook-auth', state: url.searchParams.get('state'), code: 'c'.repeat(43) });
test('PKCE binds the exact dashboard popup, state and source; only scoped tokens live in memory', async () => {
  const env = browser((url, popup, emit) => {
    const data = { type: 'crrt:storybook-auth', state: url.searchParams.get('state'), code: 'c'.repeat(43) };
    emit(data, 'https://attacker.test'); emit(data, input.dashboardUrl, {});
    emit({ ...data, state: 'wrong' }); emit({ ...data, type: 'wrong' }); emit({ ...data, code: 'short' });
    assert.equal(env.calls.length, 0); emit(data);
  });
  let changes = 0;
  const remove = subscribeScopedSessions(() => changes++);
  try {
    await connectStorybook(input);
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].url, `${input.apiBase}/v1/storybook/auth/exchange`);
    assert.equal(env.calls[0].options.credentials, 'omit');
    const body = JSON.parse(env.calls[0].options.body);
    assert.equal(createHash('sha256').update(body.verifier).digest('base64url'), env.target.searchParams.get('codeChallenge'));
    assert.equal(body.state, env.target.searchParams.get('state'));
    assert.equal(env.target.pathname, '/dashboard/widget-auth');
    assert.equal(env.target.searchParams.get('origin'), 'http://localhost:6007');
    assert.equal(env.target.href.includes(token), false);
    assert.equal(env.target.searchParams.has('verifier'), false);
    assert.equal(getScopedToken(input), token);
    assert.equal(getScopedToken({ ...input, connectionId: 'other' }), undefined);
    assert.equal(getScopedToken({ ...input, apiBase: 'https://other.test/api' }), undefined);
    assert.equal(changes, 1);
    assert.equal(env.popup.closed, true);
    assert.equal(env.handlers.size, 0);
    clearScopedSession(input); assert.equal(getScopedToken(input), undefined); assert.equal(changes, 2);
  } finally { remove(); env.restore(); }
});
test('eligibility and comments send the scoped bearer token with cookies omitted', async () => {
  const env = browser(complete);
  try {
    await connectStorybook(input);
    globalThis.fetch = async (url, options) => {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return url.endsWith('/eligibility') ? Response.json({ state: 'ready' }) : Response.json({ id: 'comment' });
    };
    assert.equal((await fetchConnectionState(input)).kind, 'ready');
    const result = await sendFeedback({ ...input, body: 'Spacing', story: { storyId: 'button--primary', componentTitle: 'Button', storyName: 'Primary' } });
    assert.deepEqual(result, { ok: true, commentId: 'comment' });
    globalThis.fetch = async () => Response.json({ code: 'session_expired' }, { status: 419 });
    assert.equal((await fetchConnectionState(input)).kind, 'session_expired');
    assert.equal(getScopedToken(input), undefined);
  } finally { env.restore(); }
});
test('expired sessions are forgotten and never attached to another request', async () => {
  const env = browser(complete), now = Date.now;
  try {
    await connectStorybook(input);
    Date.now = () => now() + 7200000;
    assert.equal(getScopedToken(input), undefined);
  } finally { Date.now = now; env.restore(); }
});
test('session rejection and malformed responses never become credentials', async () => {
  for (const response of [{ accessToken: 'account-token' }, { accessToken: token, displayName: 'Ada', expiresAt: 'bad' }]) {
    const env = browser(complete, response);
    try { await assert.rejects(connectStorybook(input), /invalid session/); assert.equal(getScopedToken(input), undefined); assert.equal(env.popup.closed, true); }
    finally { env.restore(); }
  }
  const env = browser(complete);
  try {
    globalThis.fetch = async () => Response.json({ message: 'Access denied' }, { status: 403 });
    await assert.rejects(connectStorybook(input), /Access denied/);
    assert.equal(getScopedToken(input), undefined);
  } finally { env.restore(); }
});
test('unsafe destinations, invalid connection IDs, blocked and closed popups fail clearly', async () => {
  const env = browser((_url, popup) => { popup.closed = true; });
  try {
    for (const change of [{ dashboardUrl: 'http://unsafe.test' }, { apiBase: 'https://user:pass@example.com/api' }, { connectionId: 'bad' }]) await assert.rejects(connectStorybook({ ...input, ...change }));
    await assert.rejects(connectStorybook(input), /was closed/);
    globalThis.window.open = () => null;
    await assert.rejects(connectStorybook(input), /Allow popups/);
  } finally { env.restore(); }
});
test('guest feedback permission stays separate from Agent eligibility', () => {
  assert.equal(canSendFeedback({ kind: 'access_denied', code: 'forbidden' }), true);
  assert.equal(canSendFeedback({ kind: 'access_denied', code: 'access_denied' }), false);
  assert.equal(canSendFeedback({ kind: 'ready' }), true);
});

test('dashboard links resolve to the actual application base path', () => {
  assert.equal(dashboardHome('https://crrt.ai'), 'https://crrt.ai/dashboard/');
  assert.equal(dashboardHome('http://127.0.0.1:4328/dashboard/'), 'http://127.0.0.1:4328/dashboard/');
});

test('stale unauthorized responses cannot remove a freshly authenticated session', async () => {
  const env = browser(complete);
  try {
    for (const previouslyAuthenticated of [false, true]) {
      clearScopedSession(input);
      if (previouslyAuthenticated) await connectStorybook(input);
      let finish;
      const stale = fetchConnectionState(input, () => new Promise(resolve => { finish = resolve; }));
      const fresh = `crrt_widget_${'n'.repeat(43)}`;
      globalThis.fetch = async () => Response.json({ accessToken: fresh, displayName: 'Ada', expiresAt: new Date(Date.now()+3600000).toISOString() });
      await connectStorybook(input);
      finish(Response.json({}, { status: 401 }));
      await stale;
      assert.equal(getScopedToken(input), fresh);
      globalThis.fetch = async () => Response.json({ accessToken: token, displayName: 'Ada', expiresAt: new Date(Date.now()+3600000).toISOString() });
    }
  } finally { env.restore(); }
});
