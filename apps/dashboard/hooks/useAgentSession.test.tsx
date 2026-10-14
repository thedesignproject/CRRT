import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  createShare: vi.fn(),
  getPrompt: vi.fn(),
  getShareEvents: vi.fn(),
  getShareState: vi.fn(),
}))

import { createShare, getPrompt, getShareEvents, getShareState } from '../api'
import { useAgentSession } from './useAgentSession'

const mockMode = vi.hoisted(() => ({ enabled: false }))
vi.mock('../lib/mocks', () => ({ get mocksEnabled() { return mockMode.enabled } }))

beforeEach(() => {
  mockMode.enabled = false
  vi.mocked(createShare).mockReset().mockResolvedValue({
    shareId: 'share-1', slug: 'slug-1', token: 'share-token', tokenUrl: 'https://app.test/state', expiresAt: '', commentCount: 2,
  })
  vi.mocked(getPrompt).mockReset().mockResolvedValue({ prompt: 'Agent prompt', tokenUrl: 'https://app.test/state' })
  vi.mocked(getShareState).mockReset().mockResolvedValue({ presence: [] } as never)
  vi.mocked(getShareEvents).mockReset().mockResolvedValue({ events: [], nextCursor: 0 })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => vi.restoreAllMocks())

describe('useAgentSession', () => {
  it('creates an authenticated exact-selection session and copies its prompt', async () => {
    const ids = ['c1', 'c2']
    const { result, unmount } = renderHook(() => useAgentSession('/api', 'access-token', 'project', ids))
    await waitFor(() => expect(result.current.session?.shareId).toBe('share-1'))
    expect(createShare).toHaveBeenCalledWith('/api', 'access-token', {
      projectId: 'project', scopeType: 'selection', commentIds: ids,
    })

    await act(async () => { await result.current.copyPrompt('codex') })
    expect(getPrompt).toHaveBeenCalledWith('/api', 'access-token', 'share-1', 'codex')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Agent prompt')
    unmount()
  })

  it('does not create a broad session without an explicit selection and exposes entitlement codes', async () => {
    const empty = renderHook(() => useAgentSession('/api', 'access-token', 'project', []))
    expect(empty.result.current.session).toBeNull()
    expect(createShare).not.toHaveBeenCalled()
    empty.unmount()

    vi.mocked(createShare).mockRejectedValueOnce(Object.assign(new Error('Upgrade the plan'), { code: 'upgrade_required' }))
    const denied = renderHook(() => useAgentSession('/api', 'access-token', 'project', ['c1']))
    await waitFor(() => expect(denied.result.current.errorCode).toBe('upgrade_required'))
    expect(denied.result.current.error).toBe('Upgrade the plan')
    denied.unmount()
  })

  it('supports dashboard fixture mode without creating a remote share', async () => {
    mockMode.enabled = true
    const { result } = renderHook(() => useAgentSession('/api', 'access-token', 'project', ['c1']))
    await waitFor(() => expect(result.current.session?.shareId).toBe('mock-project'))
    expect(createShare).not.toHaveBeenCalled()
  })
})

it.each([null, 'offline', {code:42}])('handles session errors without a usable code: %j', async error => {
 vi.mocked(createShare).mockRejectedValueOnce(error)
 const {result,unmount}=renderHook(() => useAgentSession('/api','token','project',['c1']))
 await waitFor(() => expect(result.current.loading).toBe(false))
 expect(result.current.errorCode).toBeNull()
 expect(result.current.session).toBeNull()
 expect(result.current.error).toBe('Could not start session')
 unmount()
})
