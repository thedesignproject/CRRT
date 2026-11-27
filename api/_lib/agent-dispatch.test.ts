import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { deliveryState, dispatchRpc, listListeners } from './agent-dispatch'

const rpc = vi.fn(), from = vi.fn()
function query(result: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'contains', 'order']) q[name] = vi.fn(() => q)
  q.limit = vi.fn(async () => result)
  return q as Record<string, ReturnType<typeof vi.fn>>
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getServiceSupabase).mockReturnValue({ rpc, from } as never)
})

it('passes the function name and arguments through', async () => {
  rpc.mockResolvedValueOnce({ data: { dispatchId: 'd', state: 'queued' }, error: null })
  expect(await dispatchRpc('agent_dispatch_send', { p_key: 'k' })).toEqual({ dispatchId: 'd', state: 'queued' })
  expect(rpc).toHaveBeenCalledWith('agent_dispatch_send', { p_key: 'k' })
})

it.each([['forbidden', 403, 'forbidden'], ['insufficient_scope', 403, 'insufficient_scope'], ['cloud_plan_limit:subscription', 403, 'agent_access_required'],
  ['listener_offline', 409, 'listener_offline'], ['feedback_changed', 409, 'feedback_changed'], ['already_sent', 409, 'already_sent'], ['some database detail', 503, 'dispatch_unavailable']])(
  'maps %s without leaking database details', async (message, status, code) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } })
    await expect(dispatchRpc('x', {})).rejects.toMatchObject({ status, code })
  })

it('treats a void result as an empty object', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null })
  expect(await dispatchRpc('x', {})).toEqual({})
})

it('lists the listeners an actor may send to, online only when running and seen within a minute', async () => {
  const recent = new Date().toISOString(), old = new Date(Date.now() - 61_000).toISOString()
  const rows = [{ id: 'live', heartbeat_at: recent, stopped: false }, { id: 'old', heartbeat_at: old, stopped: false }, { id: 'stopped', heartbeat_at: recent, stopped: true }]
    .map(row => ({ ...row, label: 'Codex', repo_url: 'https://github.com/a/b' }))
  const q = query({ data: rows, error: null })
  from.mockReturnValue(q)
  expect(await listListeners('p', 'u')).toEqual([
    { listenerId: 'live', label: 'Codex', repoUrl: 'https://github.com/a/b', online: true, stopped: false },
    { listenerId: 'old', label: 'Codex', repoUrl: 'https://github.com/a/b', online: false, stopped: false },
    { listenerId: 'stopped', label: 'Codex', repoUrl: 'https://github.com/a/b', online: false, stopped: true },
  ])
  expect(from).toHaveBeenCalledWith('agent_listeners')
  expect(q.eq).toHaveBeenCalledWith('project_key', 'p')
  expect(q.contains).toHaveBeenCalledWith('sender_ids', ['u'])
})

it('lists only a connection’s own listeners for recovery', async () => {
  const q = query({ data: null, error: null })
  from.mockReturnValue(q)
  expect(await listListeners('p', 'u', 'connection')).toEqual([])
  expect(q.eq).toHaveBeenCalledWith('connection_id', 'connection')
  expect(q.eq).toHaveBeenCalledWith('user_id', 'u')
  expect(q.contains).not.toHaveBeenCalled()
})

it('fails closed when listeners or dispatches cannot be read', async () => {
  from.mockReturnValueOnce(query({ data: null, error: { message: 'down' } }))
  await expect(listListeners('p', 'u')).rejects.toMatchObject({ status: 503, code: 'dispatch_unavailable' })
  from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: null, error: { message: 'down' } }))
  await expect(deliveryState('p', 'u')).rejects.toMatchObject({ status: 503, code: 'dispatch_unavailable' })
})

it('shows a received comment as working or blocked while the agent reports it', async () => {
  const states = ['queued', 'received', 'received', 'received', 'completed', 'cancelled', 'received']
  const progress = ['unassigned', 'claimed', 'in_progress', 'blocked', 'ready_for_testing', 'unassigned', null]
  const rows = states.map((state, i) => ({ id: `d${i}`, comment_id: `c${i}`, listener_id: 'l', state, reason: state === 'cancelled' ? 'feedback_changed' : null,
    comments: progress[i] === null ? null : { implementation_status: progress[i] } }))
  const dispatches = query({ data: rows, error: null })
  from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(dispatches)
  const result = await deliveryState('p', 'u')
  expect(result.listeners).toEqual([])
  expect(result.dispatches.map(d => d.state)).toEqual(['queued', 'received', 'working', 'blocked', 'completed', 'cancelled', 'received'])
  expect(result.dispatches[5]).toEqual({ dispatchId: 'd5', commentId: 'c5', listenerId: 'l', state: 'cancelled', reason: 'feedback_changed' })
  expect(from).toHaveBeenLastCalledWith('agent_dispatches')
  expect(dispatches.eq).toHaveBeenCalledWith('project_key', 'p')
  expect(dispatches.order).toHaveBeenCalledWith('created_at', { ascending: false })
  from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: null, error: null }))
  expect((await deliveryState('p', 'u')).dispatches).toEqual([])
})
