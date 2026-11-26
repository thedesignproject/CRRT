import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentDelivery } from '../api'
import type { Comment } from '../lib/types'
import { sendErrorMessage, useDirectDelivery } from './useDirectDelivery'

const api = vi.hoisted(() => ({ getAgentDelivery: vi.fn(), sendAgentDispatch: vi.fn() }))
vi.mock('../api', () => api)

const listener = (listenerId: string, online = true) => ({ listenerId, label: `term ${listenerId}`, repoUrl: '', online })
const comment = (id: string, updatedAt = 't1') => ({ id, updatedAt }) as Comment
const state = (over: Partial<AgentDelivery> = {}): AgentDelivery => ({ listeners: [listener('l1')], dispatches: [], ...over })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  api.getAgentDelivery.mockReset().mockResolvedValue(state())
  api.sendAgentDispatch.mockReset().mockResolvedValue({ dispatchId: 'd', state: 'queued' })
})
afterEach(() => vi.useRealTimers())

it('stays idle while the page is closed or no project is open', async () => {
  const closed = renderHook(() => useDirectDelivery('/api', 'token', 'pk', false))
  const none = renderHook(() => useDirectDelivery('/api', 'token', null, true))
  await act(() => none.result.current.send([comment('c1')]))
  expect(closed.result.current.enabled).toBe(false)
  expect(none.result.current).toMatchObject({ enabled: false, checking: false, listeners: [], online: false, error: null })
  expect(api.getAgentDelivery).not.toHaveBeenCalled()
  expect(api.sendAgentDispatch).not.toHaveBeenCalled()
})

it('picks the only listening terminal and sends what is not already with an agent', async () => {
  api.getAgentDelivery.mockResolvedValue(state({ dispatches: [{ dispatchId: 'd0', commentId: 'c2', state: 'working' }] }))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  expect(result.current.checking).toBe(true)
  await waitFor(() => expect(result.current.online).toBe(true))
  expect(result.current).toMatchObject({ enabled: true, destination: 'l1', checking: false })
  expect(result.current.stateFor('c2')).toBe('working')
  expect(result.current.stateFor('c1')).toBeUndefined()

  await act(() => result.current.send([comment('c1'), comment('c2')]))
  expect(api.sendAgentDispatch).toHaveBeenCalledOnce()
  expect(api.sendAgentDispatch).toHaveBeenCalledWith('/api', 'token', 'pk', expect.objectContaining({ listenerId: 'l1', commentId: 'c1', expectedUpdatedAt: 't1' }))
  expect(api.getAgentDelivery).toHaveBeenCalledTimes(2)
  expect(result.current).toMatchObject({ busy: false, error: null })
})

it('tells the caller when a send changes state, and not on unchanged polls', async () => {
  const dispatch = (state: string) => state ? [{ dispatchId: 'd0', commentId: 'c1', state }] : []
  api.getAgentDelivery
    .mockResolvedValueOnce(state())
    .mockResolvedValueOnce(state({ dispatches: dispatch('queued') }))
    .mockResolvedValueOnce(state({ dispatches: dispatch('completed') }))
    .mockResolvedValue(state({ dispatches: dispatch('completed') }))
  const onProgress = vi.fn()
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true, onProgress))
  await waitFor(() => expect(result.current.online).toBe(true))
  expect(onProgress).not.toHaveBeenCalled()
  await act(() => result.current.send([comment('c1')]))
  expect(onProgress).toHaveBeenCalledTimes(1)
  await act(() => result.current.send([comment('c2')]))
  await act(() => result.current.send([comment('c3')]))
  expect(onProgress).toHaveBeenCalledTimes(2)
})

it('waits for a choice when several or no terminals listen, and keeps it across polls', async () => {
  vi.useFakeTimers()
  api.getAgentDelivery.mockResolvedValue(state({ listeners: [listener('l1'), listener('l2'), listener('l3', false)] }))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.destination).toBe('')
  expect(result.current.online).toBe(false)
  await act(() => result.current.send([comment('c1')]))
  expect(api.sendAgentDispatch).not.toHaveBeenCalled()

  act(() => result.current.setDestination('l2'))
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(api.getAgentDelivery).toHaveBeenCalledTimes(2)
  expect(result.current.destination).toBe('l2')
  expect(result.current.online).toBe(true)

  api.getAgentDelivery.mockResolvedValue(state({ listeners: [listener('l1', false)] }))
  const offline = renderHook(() => useDirectDelivery('/api', 'token', 'other', true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(offline.result.current.destination).toBe('')
})

it('reports a failed check and recovers on the next one', async () => {
  vi.useFakeTimers()
  api.getAgentDelivery.mockRejectedValueOnce(new Error('down'))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.error).toBe('Couldn’t check which terminals are listening. Trying again…')
  expect(result.current.listeners).toEqual([])
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(result.current.error).toBeNull()
  expect(result.current.online).toBe(true)
})

it('explains a failed send and reuses the idempotency key on retry', async () => {
  api.sendAgentDispatch.mockRejectedValueOnce(Object.assign(new Error('Offline'), { code: 'listener_offline' }))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(() => result.current.send([comment('c1')]))
  expect(result.current.error).toBe(sendErrorMessage('listener_offline'))
  await act(() => result.current.send([comment('c1')]))
  expect(result.current.error).toBeNull()
  const [first, second] = api.sendAgentDispatch.mock.calls.map((call) => call[3].idempotencyKey)
  expect(second).toBe(first)
  await act(() => result.current.send([comment('c1', 't2')]))
  expect(api.sendAgentDispatch.mock.calls[2][3].idempotencyKey).not.toBe(first)
})

it('ignores a second send while one is running', async () => {
  const pending = deferred<unknown>()
  api.sendAgentDispatch.mockReturnValueOnce(pending.promise)
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await waitFor(() => expect(result.current.online).toBe(true))
  let first!: Promise<void>
  act(() => { first = result.current.send([comment('c1')]) })
  expect(result.current.busy).toBe(true)
  await act(() => result.current.send([comment('c1')]))
  pending.resolve({})
  await act(() => first)
  expect(api.sendAgentDispatch).toHaveBeenCalledOnce()
})

it('drops results that land after the project changes', async () => {
  const read = deferred<AgentDelivery>()
  const failedRead = deferred<AgentDelivery>()
  api.getAgentDelivery.mockReturnValueOnce(read.promise).mockReturnValueOnce(failedRead.promise)
  const { result, rerender } = renderHook(({ project }) => useDirectDelivery('/api', 'token', project, true), { initialProps: { project: 'a' } })
  rerender({ project: 'b' })
  rerender({ project: 'c' })
  read.resolve(state())
  failedRead.reject(new Error('late'))
  await waitFor(() => expect(result.current.online).toBe(true))
  expect(result.current.error).toBeNull()

  const send = deferred<unknown>()
  api.sendAgentDispatch.mockReturnValueOnce(send.promise)
  let sending!: Promise<void>
  act(() => { sending = result.current.send([comment('c1')]) })
  rerender({ project: 'd' })
  send.reject(Object.assign(new Error('gone'), { code: 'already_sent' }))
  await act(() => sending)
  expect(result.current.error).toBeNull()
})

it('drops a send that succeeds after the project changes', async () => {
  const { result, rerender } = renderHook(({ project }) => useDirectDelivery('/api', 'token', project, true), { initialProps: { project: 'a' } })
  await waitFor(() => expect(result.current.online).toBe(true))
  const send = deferred<unknown>()
  api.sendAgentDispatch.mockReturnValueOnce(send.promise)
  let sending!: Promise<void>
  act(() => { sending = result.current.send([comment('c1')]) })
  rerender({ project: 'b' })
  const reads = api.getAgentDelivery.mock.calls.length
  send.resolve({})
  await act(() => sending)
  expect(api.getAgentDelivery.mock.calls.length).toBe(reads)
})

it('words each send failure', () => {
  expect(sendErrorMessage('listener_stopped')).toBe(sendErrorMessage('listener_offline'))
  expect(sendErrorMessage('feedback_changed')).toMatch(/changed/)
  expect(sendErrorMessage('already_sent')).toMatch(/already/)
  expect(sendErrorMessage('listener_not_found')).toBe(sendErrorMessage('listener_offline'))
  expect(sendErrorMessage('feedback_not_eligible')).toMatch(/isn’t ready for an agent anymore/)
  expect(sendErrorMessage('idempotency_conflict')).toMatch(/Reload the page/)
  expect(sendErrorMessage('forbidden')).toMatch(/Pick another terminal/)
  expect(sendErrorMessage('sender_removed')).toMatch(/Your role can’t send/)
  expect(sendErrorMessage('project_access_denied')).toBe(sendErrorMessage('sender_removed'))
  expect(sendErrorMessage('repository_changed')).toMatch(/Start listening again/)
  expect(sendErrorMessage('agent_access_required')).toMatch(/plan doesn’t include Agent/)
  expect(sendErrorMessage('upgrade_required')).toBe(sendErrorMessage('agent_access_required'))
  expect(sendErrorMessage('owner_upgrade_required')).toMatch(/Ask the project owner to upgrade/)
  expect(sendErrorMessage('seat_limit_reached')).toMatch(/no Agent seat/)
  // A refusal without a code still says why.
  expect(sendErrorMessage(undefined, 403)).toBe(sendErrorMessage('sender_removed'))
  expect(sendErrorMessage(undefined, 402)).toBe(sendErrorMessage('agent_access_required'))
  for (const code of [undefined, 'dispatch_unavailable', 'mystery', 'toString']) expect(sendErrorMessage(code)).toMatch(/won’t be sent twice/)
  expect(sendErrorMessage(undefined, 503)).toMatch(/won’t be sent twice/)
})

it('stops asking which terminals listen once the plan or role refuses', async () => {
  vi.useFakeTimers()
  api.getAgentDelivery.mockRejectedValue(Object.assign(new Error('Upgrade'), { status: 402, code: 'upgrade_required' }))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.error).toBe(sendErrorMessage('upgrade_required'))
  await act(() => vi.advanceTimersByTimeAsync(20_000))
  expect(api.getAgentDelivery).toHaveBeenCalledOnce()
})

it('passes the status of a refused send that has no code', async () => {
  api.sendAgentDispatch.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(() => result.current.send([comment('c1')]))
  expect(result.current.error).toBe(sendErrorMessage(undefined, 403))
})
