import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { DirectAgentSend } from '../components/DirectAgentSend'
import { fetchDelivery, sendFeedback } from '../components/FeedbackWidget/dispatch'
import { WidgetRequestError } from '../lib/widgetLogin'
import type { WidgetAgentComment } from '../components/FeedbackWidget/api'
vi.mock('../components/FeedbackWidget/dispatch', () => ({ fetchDelivery: vi.fn(), sendFeedback: vi.fn() }))
const session = { accessToken: 'token', displayName: 'Tom', expiresAt: '2099-01-01' }
const listener = { listenerId: 'terminal', label: 'My terminal', repoUrl: 'https://github.com/test/repo', online: true, stopped: false }
const comment: WidgetAgentComment = { id: 'comment', body: 'Fix header', pageUrl: 'https://example.com', selector: 'h1', authorName: null, reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z' }
const onSent = vi.fn()
function view(c = comment, pageUrl = 'https://example.com') { return <DirectAgentSend apiBase="/api" projectId="test" pageUrl={pageUrl} session={session} onSent={onSent}>{({ action }) => action(c)}</DirectAgentSend> }
const send = () => screen.getByRole('button', { name: 'SEND: Fix header' })
beforeEach(() => { vi.mocked(fetchDelivery).mockReset().mockResolvedValue({ listeners: [listener], dispatches: [] }); vi.mocked(sendFeedback).mockReset().mockResolvedValue({ dispatchId: 'dispatch', state: 'queued' }); onSent.mockClear() })
afterEach(() => vi.useRealTimers())
it('selects the sole online terminal and sends only the exact reviewed revision', async () => {
 render(view()); expect(send()).toBeDisabled(); await waitFor(() => expect(send()).toBeEnabled())
 fireEvent.click(send()); await waitFor(() => expect(onSent).toHaveBeenCalledOnce())
 expect(sendFeedback).toHaveBeenCalledWith('/api', session, expect.objectContaining({ commentId: 'comment', expectedUpdatedAt: comment.updatedAt, listenerId: 'terminal', idempotencyKey: expect.any(String) }))
})
it('requires selection among multiple listeners and keeps offline listeners disabled', async () => {
 vi.mocked(fetchDelivery).mockResolvedValue({ listeners: [listener, { ...listener, listenerId: 'two' }, { ...listener, listenerId: 'off', online: false }], dispatches: [] })
 render(view()); await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled()); expect(send()).toBeDisabled()
 fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } }); expect(send()).toBeEnabled()
 expect(screen.getByRole('option', { name: /Offline/ })).toBeDisabled()
})
it.each(['queued', 'received', 'working', 'blocked', 'completed', 'cancelled', 'future'])('shows %s delivery and prevents duplicate active sends', async state => {
 vi.mocked(fetchDelivery).mockResolvedValue({ listeners: [listener], dispatches: [{ dispatchId: 'd', commentId: 'comment', listenerId: 'terminal', state, reason: null }] })
 render(view()); await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled())
 expect(send().hasAttribute('disabled')).toBe(['queued', 'received', 'working', 'blocked'].includes(state))
 expect(screen.getAllByRole('status')).toHaveLength(2)
})
it.each([{ ...comment, updatedAt: undefined }, { ...comment, reviewStatus: 'rejected' as const }, { ...comment, implementationStatus: 'in_progress' as const }])('does not send ineligible feedback', async c => {
 render(view(c)); await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled()); expect(send()).toBeDisabled()
})
it.each([['listener_offline', /stopped listening/], ['feedback_changed', /Feedback changed/], ['already_sent', /already queued/], ['unknown', /could not be confirmed/]])('explains %s and retries with the same key', async (code, message) => {
 vi.mocked(sendFeedback).mockRejectedValueOnce(new WidgetRequestError(409, String(code)))
 render(view()); await waitFor(() => expect(send()).toBeEnabled()); fireEvent.click(send())
 await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(message as RegExp))
 fireEvent.click(send()); await waitFor(() => expect(onSent).toHaveBeenCalledOnce())
 expect(vi.mocked(sendFeedback).mock.calls[0][2].idempotencyKey).toBe(vi.mocked(sendFeedback).mock.calls[1][2].idempotencyKey)
})
it('recovers availability on the next poll and preserves current selection', async () => {
 vi.useFakeTimers(); vi.mocked(fetchDelivery).mockRejectedValueOnce(new Error('offline'))
 render(view()); await act(async () => {}); expect(screen.getByRole('alert').textContent).toContain('Could not check')
 await act(async () => { await vi.advanceTimersByTimeAsync(5000) }); expect(send()).toBeEnabled(); expect(screen.queryByRole('alert')).toBeNull()
 await act(async () => { await vi.advanceTimersByTimeAsync(5000) }); expect(screen.getByRole('combobox')).toHaveValue('terminal')
})
it('does not apply a send result after changing page', async () => {
 let resolve!: (v: { dispatchId: string; state: string }) => void
 vi.mocked(sendFeedback).mockReturnValue(new Promise(r => { resolve = r }))
 const ui = render(view()); await waitFor(() => expect(send()).toBeEnabled()); fireEvent.click(send()); expect(send()).toBeDisabled()
 ui.rerender(view(comment, 'https://example.com/other')); await act(async () => resolve({ dispatchId: 'd', state: 'queued' })); expect(onSent).not.toHaveBeenCalled()
})
it('ignores rejected requests after unmount and handles plain network errors', async () => {
 let reject!: (e: Error) => void
 vi.mocked(sendFeedback).mockReturnValueOnce(new Promise((_r, r) => { reject = r }))
 const ui = render(view()); await waitFor(() => expect(send()).toBeEnabled()); fireEvent.click(send()); ui.unmount()
 await act(async () => reject(new Error('gone'))); expect(onSent).not.toHaveBeenCalled()
 vi.mocked(sendFeedback).mockRejectedValue(new Error('network')); render(view()); await waitFor(() => expect(send()).toBeEnabled()); fireEvent.click(send())
 await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be confirmed'))
})
it.each([true, false])('discards stale availability responses after unmount (success %s)', async success => {
 let resolve!: (v: any) => void, reject!: (e: Error) => void
 vi.mocked(fetchDelivery).mockReturnValue(new Promise((a, b) => { resolve = a; reject = b }))
 const ui = render(view()); ui.unmount(); await act(async () => { if (success) resolve({ listeners: [listener], dispatches: [] }); else reject(new Error('stale')) })
 expect(onSent).not.toHaveBeenCalled()
})
it('deduplicates two click events before React commits the disabled state', async () => {
 let resolve!: (v: { dispatchId: string; state: string }) => void
 vi.mocked(sendFeedback).mockReturnValue(new Promise(r => { resolve = r }))
 render(view()); await waitFor(() => expect(send()).toBeEnabled())
 const button = send()
 act(() => { button.click(); button.click() })
 expect(sendFeedback).toHaveBeenCalledOnce()
 await act(async () => resolve({ dispatchId: 'd', state: 'queued' }))
})
