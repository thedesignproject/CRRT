import { beforeEach, describe, expect, it, vi } from 'vitest'

const local = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { storage: { local } } }))

import { ACTIVE_PROJECT_STORAGE_KEY, getActiveProject, setActiveProject } from './project-context'

beforeEach(() => { vi.clearAllMocks() })

describe('extension project context', () => {
  it('reads only valid stored selections', async () => {
    local.get.mockResolvedValueOnce({ [ACTIVE_PROJECT_STORAGE_KEY]: { publicKey: 'p', name: 'Project' } })
    await expect(getActiveProject()).resolves.toEqual({ publicKey: 'p', name: 'Project' })
    for (const value of [null, 'p', {}, { publicKey: 'p' }]) {
      local.get.mockResolvedValueOnce({ [ACTIVE_PROJECT_STORAGE_KEY]: value })
      await expect(getActiveProject()).resolves.toBeNull()
    }
  })

  it('stores and clears the active project', async () => {
    await setActiveProject({ publicKey: 'p', name: 'Project' })
    expect(local.set).toHaveBeenCalledWith({ [ACTIVE_PROJECT_STORAGE_KEY]: { publicKey: 'p', name: 'Project' } })
    await setActiveProject(null)
    expect(local.remove).toHaveBeenCalledWith(ACTIVE_PROJECT_STORAGE_KEY)
  })
})
