import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentDelivery } from '../api'
import type { Comment } from '../lib/types'
import { sendErrorMessage, useDirectDelivery } from './useDirectDelivery'

const api = vi.hoisted(() => ({ getAgentDelivery: vi.fn(), sendAgentDispatch: vi.fn() }))
const flags = vi.hoisted(() => ({ directSendEnabled: true }))
vi.mock('../api', () => api)
vi.mock('../lib/flags', () => ({ get directSendEnabled() { return flags.directSendEnabled } }))

const listener = (listenerId: string, online = true) => ({ listenerId, label: `term ${listenerId}`, repoUrl: '', online, stopped: !online })
const comment = (id: string, updatedAt = 't1') => ({ id, updatedAt }) as Comment
const state = (over: Partial<AgentDelivery> = {}): AgentDelivery => ({ listeners: [listener('l1')], dispatches: [], ...over })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  flags.directSendEnabled = true
  api.getAgentDelivery.mockReset().mockResolvedValue(state())
  api.sendAgentDispatch.mockReset().mockResolvedValue({ dispatchId: 'd', state: 'queued' })
})
afterEach(() => vi.useRealTimers())

it('stays idle while the flag is off, the page is closed, or no project is open', async () => {
  flags.directSendEnabled = false
  const off = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  expect(off.result.current.enabled).toBe(false)
  const closed = renderHook(() => useDirectDelivery('/api', 'token', 'pk', false))
  flags.directSendEnabled = true
  const none = renderHook(() => useDirectDelivery('/api', 'token', null, true))
  await act(() => none.result.current.send([comment('c1')]))
  expect(closed.result.current.enabled).toBe(false)
  expect(none.result.current).toMatchObject({ enabled: false, checking: false, listeners: [], online: false, error: null })
  expect(api.getAgentDelivery).not.toHaveBeenCalled()
  expect(api.sendAgentDispatch).not.toHaveBeenCalled()
})

it('picks the only listening terminal and sends what is not already with an agent', async () => {
  api.getAgentDelivery.mockResolvedValue(state({ dispatches: [{ dispatchId: 'd0', commentId: 'c2', listenerId: 'l1', state: 'working', reason: null }] }))
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
  expect(sendErrorMessage(undefined)).toMatch(/won’t be sent twice/)
})
