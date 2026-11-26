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

it('takes owner role and capabilities for a new project from the server list', async () => {
  const listed = { ...claimed, role: 'owner', capabilities: ['project:manage'] } as Project
  vi.mocked(listProjects).mockResolvedValueOnce([]).mockResolvedValueOnce([listed])
  const { hook, project } = await claim()
  expect(project).toEqual(listed)
  expect(hook.result.current.projects).toEqual([listed])
})

it.each([
  ['the list fails', () => vi.mocked(listProjects).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'))],
  ['the list is not caught up yet', () => vi.mocked(listProjects).mockResolvedValue([])],
])('treats the person who claimed a project as its owner when %s', async (_case, arrange) => {
  arrange()
  const { hook, project } = await claim()
  expect(project.role).toBe('owner')
  expect(hook.result.current.projects).toEqual([{ ...claimed, role: 'owner' }])
})

it('keeps a role the claim already returned', async () => {
  vi.mocked(claimProject).mockResolvedValue({ ...claimed, role: 'admin' } as Project)
  const { project } = await claim()
  expect(project.role).toBe('admin')
})
