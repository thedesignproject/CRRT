import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/widget-session.js', async (original) => ({ ...await original<any>(), requireWidgetSession: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listComments: vi.fn() }))
vi.mock('../../_lib/supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { requireWidgetSession, WidgetSessionError } from '../../_lib/widget-session.js'
import { listComments } from '../../_lib/store.js'
import { getServiceSupabase } from '../../_lib/supabase.js'
import handler from './comments.js'
const origin = 'https://example.com'
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() } }
async function call(method: string, query = { id: 'c' }, body: unknown = { body: ' hello ' }) {
  const res = response(); await handler({ method, headers: {}, query, body } as never, res as never); return res
}
function db(results = [{ data: { url: `${origin}/page` }, error: null }, { data: { id: 'c' }, error: null }] as any[]) {
  const q: any = {}; for (const name of ['select', 'eq', 'delete', 'update']) q[name] = vi.fn(() => q)
  q.maybeSingle = vi.fn(async () => results.shift())
  vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => q) } as never); return q
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'u', project_key: 'p', origin, display_name: 'a', expires_at: 'later' }) })
it('supports preflight before authentication and rejects unsupported methods', async () => {
  expect((await call('OPTIONS')).status).toHaveBeenCalledWith(204); expect(requireWidgetSession).not.toHaveBeenCalled()
  expect((await call('POST')).status).toHaveBeenCalledWith(405)
})
it('lists only the account’s widget feedback on the exact origin', async () => {
  vi.mocked(listComments).mockResolvedValue([{ id: 'yes', pageUrl: `${origin}/page` }, { id: 'no', pageUrl: 'https://other.test' }, { pageUrl: 'invalid' }] as never)
  const res = await call('GET'); expect(listComments).toHaveBeenCalledWith('p', { userId: 'u' }); expect(res.json).toHaveBeenCalledWith([{ id: 'yes', pageUrl: `${origin}/page` }])
})
it.each(['PATCH', 'DELETE'])('scopes %s by author, project, stored URL, source and visibility', async (method) => {
  const q = db(); expect((await call(method)).status).toHaveBeenCalledWith(204)
  for (const pair of [['id', 'c'], ['created_by_user_id', 'u'], ['project_id', 'p'], ['url', `${origin}/page`], ['source', 'widget'], ['visibility', 'shared']]) expect(q.eq).toHaveBeenCalledWith(...pair)
  if (method === 'PATCH') expect(q.update).toHaveBeenCalledWith({ comment: 'hello', updated_at: expect.any(String) })
})
it('rejects missing IDs, missing/foreign comments and changed rows', async () => {
  expect((await call('PATCH', {} as any)).status).toHaveBeenCalledWith(400)
  db([{ data: null, error: null }]); expect((await call('DELETE')).status).toHaveBeenCalledWith(404)
  db([{ data: { url: 'https://other.test' }, error: null }]); expect((await call('PATCH')).status).toHaveBeenCalledWith(403)
  db([{ data: { url: origin }, error: null }, { data: null, error: null }]); expect((await call('DELETE')).status).toHaveBeenCalledWith(404)
})
it.each([undefined, {}, { body: 4 }, { body: ' ' }, { body: 'x'.repeat(8001) }])('rejects invalid edit bodies %#', async (body) => {
  db(); const res = response(); await handler({ method: 'PATCH', query: { id: 'c' }, headers: {}, body } as never, res as never); expect(res.status).toHaveBeenCalledWith(400)
})
it('fails closed on auth and database errors', async () => {
  db([{ error: {} }]); expect((await call('DELETE')).status).toHaveBeenCalledWith(500)
  db([{ data: { url: origin }, error: null }, { error: {} }]); expect((await call('PATCH')).status).toHaveBeenCalledWith(500)
  vi.mocked(requireWidgetSession).mockRejectedValue(new WidgetSessionError(401, 'Sign in')); expect((await call('GET')).status).toHaveBeenCalledWith(401)
})
