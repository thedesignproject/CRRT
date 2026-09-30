/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { startWidgetLogin, widgetComments, widgetRequest } from '../lib/widgetLogin'
const token = `crrt_widget_${'a'.repeat(43)}`
const session = { accessToken: token, displayName: 'Ada', expiresAt: '2099-01-01T00:00:00Z' }
const popup = { location: { href: '' }, closed: false, close: vi.fn() }
const api = 'https://crrt.ai/api'
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); popup.location.href = ''; popup.closed = false; popup.close.mockReset()
  vi.spyOn(window, 'open').mockReturnValue(popup as never)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(session))))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function ready() { await vi.waitFor(() => expect(popup.location.href).toContain('/dashboard/widget-auth')) }
function message(overrides: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const url = new URL(popup.location.href)
  window.dispatchEvent(new MessageEvent('message', { origin: url.origin, source: popup as never, data: { type: 'crrt:widget-auth', state: url.searchParams.get('state'), code: 'b'.repeat(43), ...overrides }, ...options }))
}
it('opens synchronously, uses the hosted session and exchanges a verified callback for a limited credential', async () => {
  const pending = startWidgetLogin(api, 'p', new AbortController().signal)
  expect(window.open).toHaveBeenCalledOnce(); await ready()
  for (const invalid of [{ type: 'other' }, { state: 'wrong' }, { code: 4 }, { code: 'bad' }]) message(invalid)
  message({}, { origin: 'https://evil.test' }); message({}, { source: null })
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://crrt.ai', source: popup as never, data: null }))
  expect(fetch).not.toHaveBeenCalled()
  message(); expect(await pending).toEqual(session)
  const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
  expect(body).toMatchObject({ code: 'b'.repeat(43), projectKey: 'p' }); expect(body.verifier).toHaveLength(43)
  expect(popup.close).toHaveBeenCalledOnce()
})
it('explains blocked popups', async () => {
  vi.mocked(window.open).mockReturnValue(null); await expect(startWidgetLogin(api, 'p', new AbortController().signal)).rejects.toThrow('Allow popups')
})
it('cleans up aborted attempts, including abort before crypto completes', async () => {
  const first = new AbortController(); first.abort()
  await expect(startWidgetLogin(api, 'p', first.signal)).rejects.toThrow('cancelled')
  const second = new AbortController(); const pending = startWidgetLogin(api, 'p', second.signal); const assertion = expect(pending).rejects.toThrow('cancelled')
  await ready(); second.abort(); await assertion
})
it('handles a closed popup and a timeout', async () => {
  let pending = startWidgetLogin(api, 'p', new AbortController().signal); let assertion = expect(pending).rejects.toThrow('window closed')
  await ready(); popup.closed = true; await assertion
  popup.closed = false; popup.location.href = ''; vi.useFakeTimers()
  pending = startWidgetLogin(api, 'p', new AbortController().signal); assertion = expect(pending).rejects.toThrow('timed out')
  await ready(); await vi.advanceTimersByTimeAsync(300_001); await assertion
})
it.each([
  [false, session], [true, {}], [true, { ...session, accessToken: 'dashboard-token' }],
  [true, { ...session, displayName: 4 }], [true, { ...session, displayName: '' }],
  [true, { ...session, expiresAt: 4 }], [true, { ...session, expiresAt: 'invalid' }], [true, { ...session, expiresAt: '2000-01-01' }],
])('rejects failed or malformed exchanges %#', async (ok, body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: ok ? 200 : 400 }))
  const pending = startWidgetLogin(api, 'p', new AbortController().signal); const assertion = expect(pending).rejects.toThrow('Could not complete')
  await ready(); message(); await assertion
})
it('uses bearer authorization only for feedback operations and sign-out', async () => {
  vi.mocked(fetch).mockImplementation(async () => new Response('[]'))
  const adapter = widgetComments(api, 'p', session)
  expect(await adapter.list('page')).toEqual([])
  await adapter.create({ body: 'hi', projectKey: 'evil' }); await adapter.update('a/b', 'edit'); await adapter.remove('a/b')
  for (const [, init] of vi.mocked(fetch).mock.calls) expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string).projectKey).toBe('p')
  expect(vi.mocked(fetch).mock.calls[2][0]).toContain('id=a%2Fb')
})
it('surfaces expiry and API errors instead of falling back to anonymous mutations', async () => {
  await expect(widgetRequest(api, '/path', { ...session, expiresAt: '2000-01-01' })).rejects.toThrow('expired')
  expect(fetch).not.toHaveBeenCalled()
  for (const status of [401, 403]) {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status }))
    await expect(widgetRequest(api, '/path', session)).rejects.toThrow(status === 401 ? 'expired' : 'Could not save')
  }
})

it('supports a relative apiBase on self-hosted sites', async () => {
  const pending = startWidgetLogin('/api', 'p', new AbortController().signal)
  await ready()
  expect(new URL(popup.location.href).origin).toBe(window.location.origin)
  message(); await expect(pending).resolves.toEqual(session)
})
