import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingSummary } from '../api'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), summary: vi.fn() }))
vi.mock('../lib/billing-availability', () => ({ billingAvailabilityOnce: mocks.enabled }))
vi.mock('../api', () => ({ getBillingSummary: mocks.summary }))
import { QUOTA_REFRESH_MS, planQuota, usePlanQuota } from './usePlanQuota'

const summary = (overrides: Partial<BillingSummary> = {}) => ({
  plan: 'pro',
  plans: [{ key: 'pro', name: 'Pro' }],
  usage: { comments: { used: 120, limit: 500, resetAt: null } },
  canManage: true,
  ...overrides,
}) as BillingSummary

beforeEach(() => { mocks.enabled.mockReset(); mocks.summary.mockReset() })

describe('planQuota', () => {
  it('reads the monthly comment allowance and the plan name', () => {
    expect(planQuota(summary())).toEqual({ plan: 'Pro', used: 120, limit: 500, canUpgrade: true })
    expect(planQuota(summary({ canManage: false, canManageSubscription: true }))?.canUpgrade).toBe(true)
    expect(planQuota(summary({ canManage: false }))?.canUpgrade).toBe(false)
    expect(planQuota(summary({ plans: undefined }))?.plan).toBe('pro')
  })

  it('is empty for unmetered or unknown plans', () => {
    expect(planQuota(summary({ plan: null }))).toBeNull()
    expect(planQuota(summary({ usage: undefined }))).toBeNull()
    expect(planQuota(summary({ usage: { comments: { used: 1, limit: null, resetAt: null } } as never }))).toBeNull()
  })
})

describe('usePlanQuota', () => {
  it('loads the quota when billing is on', async () => {
    mocks.enabled.mockResolvedValue(true)
    mocks.summary.mockResolvedValue(summary())
    const { result } = renderHook(() => usePlanQuota('/api', 'token', 'u'))
    await waitFor(() => expect(result.current?.limit).toBe(500))
    expect(mocks.summary).toHaveBeenCalledWith('/api', 'token')
  })

  it('stays empty when billing is off or fails', async () => {
    mocks.enabled.mockResolvedValue(false)
    const off = renderHook(() => usePlanQuota('/api', 'token', 'u'))
    await waitFor(() => expect(mocks.enabled).toHaveBeenCalled())
    expect(off.result.current).toBeNull()
    expect(mocks.summary).not.toHaveBeenCalled()

    mocks.enabled.mockResolvedValue(true)
    mocks.summary.mockRejectedValue(new Error('down'))
    const failed = renderHook(() => usePlanQuota('/api', 'token', 'v'))
    await waitFor(() => expect(mocks.summary).toHaveBeenCalled())
    await Promise.resolve()
    expect(failed.result.current).toBeNull()
  })

  it('reloads when people come back to the tab, at most once a minute', async () => {
    let now = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mocks.enabled.mockResolvedValue(true)
    mocks.summary.mockReset().mockResolvedValue(summary())
    const { result, unmount } = renderHook(() => usePlanQuota('/api', 'token', 'refresh'))
    await waitFor(() => expect(result.current?.limit).toBe(500))
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    // Too soon: nothing reloads.
    act(() => { window.dispatchEvent(new Event('focus')) })
    // Hidden tabs never reload.
    now += QUOTA_REFRESH_MS
    visibility.mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.summary).toHaveBeenCalledTimes(1)

    visibility.mockReturnValue('visible')
    mocks.summary.mockResolvedValue(summary({ usage: { comments: { used: 9, limit: 600, resetAt: null } } as never }))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(result.current?.limit).toBe(600))
    expect(mocks.summary).toHaveBeenCalledTimes(2)

    unmount()
    now += QUOTA_REFRESH_MS
    window.dispatchEvent(new Event('focus'))
    expect(mocks.summary).toHaveBeenCalledTimes(2)
    clock.mockRestore()
    visibility.mockRestore()
  })

  it('ignores answers that arrive after unmount', async () => {
    let resolve!: (value: boolean) => void
    mocks.enabled.mockReturnValue(new Promise<boolean>((r) => { resolve = r }))
    mocks.summary.mockRejectedValue(new Error('late'))
    const ok = renderHook(() => usePlanQuota('/api', 'token', 'u'))
    ok.unmount()
    resolve(true)
    await waitFor(() => expect(mocks.summary).toHaveBeenCalled())

    mocks.enabled.mockResolvedValue(true)
    mocks.summary.mockResolvedValue(summary())
    const late = renderHook(() => usePlanQuota('/api', 'token', 'w'))
    late.unmount()
    await waitFor(() => expect(mocks.summary).toHaveBeenCalledTimes(2))
  })
})
