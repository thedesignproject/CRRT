import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({ claimProject: vi.fn(), listProjects: vi.fn(), checkProjectKeyAvailability: vi.fn() }))
vi.mock('../lib/mocks', () => ({ mocksEnabled: false, getMockProjects: () => [] }))

import { claimProject, listProjects, type Project } from '../api'
import { useProjects } from './useProjects'

const claimed = { publicKey: 'new', slug: 'new', name: 'New', allowedOrigins: [], createdAt: '', updatedAt: '' } as Project

beforeEach(() => {
  vi.mocked(listProjects).mockReset().mockResolvedValue([])
  vi.mocked(claimProject).mockReset().mockResolvedValue(claimed)
})

async function claim() {
  const hook = renderHook(() => useProjects('/api', 'token'))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  let project: Project | undefined
  await act(async () => { project = await hook.result.current.claimProject('new', 'New') })
  return { hook, project: project! }
}

it('shows a claimed project with the owner role and capabilities the claim returned', async () => {
  const owned = { ...claimed, role: 'owner', capabilities: ['project:manage'] } as Project
  vi.mocked(claimProject).mockResolvedValue(owned)
  const { hook, project } = await claim()
  expect(claimProject).toHaveBeenCalledWith('/api', 'token', 'new', 'New')
  expect(project.role).toBe('owner')
  expect(hook.result.current.projects).toEqual([owned])
  expect(listProjects).toHaveBeenCalledOnce()
})
