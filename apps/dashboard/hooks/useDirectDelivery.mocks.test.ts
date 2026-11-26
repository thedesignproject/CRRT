import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useDirectDelivery } from './useDirectDelivery'

const api = vi.hoisted(() => ({ getAgentDelivery: vi.fn(), sendAgentDispatch: vi.fn() }))
vi.mock('../api', () => api)
vi.mock('../lib/mocks', () => ({ mocksEnabled: true }))

it('stays off in the mock preview, which has no dispatch API', () => {
  const { result } = renderHook(() => useDirectDelivery('/api', 'token', 'pk', true))
  expect(result.current.enabled).toBe(false)
  expect(api.getAgentDelivery).not.toHaveBeenCalled()
})
