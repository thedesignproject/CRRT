import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/mocks', () => ({ mocksEnabled: false }))
vi.mock('../api', () => ({
  cancelProjectInvite: vi.fn(),
  getProjectRepoConfig: vi.fn(),
  inviteProjectMember: vi.fn(),
  listProjectInvites: vi.fn(),
  listProjectMembers: vi.fn(),
  removeProjectMember: vi.fn(),
  renameProject: vi.fn(),
  updateProjectAllowedOrigins: vi.fn(),
  updateProjectRepoConfig: vi.fn(),
}))

import {
  getProjectRepoConfig,
  listProjectInvites,
  listProjectMembers,
  updateProjectRepoConfig,
  type ProjectMember,
  type RepoConfig,
} from '../api'
import { useProjectSettings } from './useProjectSettings'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function admin(projectKey: string): ProjectMember {
  return {
    userId: `admin-${projectKey}`,
    email: `${projectKey}@example.com`,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function repoConfig(projectKey: string, agentInstructions: string): RepoConfig {
  return {
    projectKey,
    repoUrl: null,
  githubOwner: null,
  githubRepo: null,
  githubConnectionStatus: 'disconnected',
    localPath: null,
    defaultBranch: 'main',
    installCommand: null,
    devCommand: null,
    testCommand: null,
    buildCommand: null,
    agentInstructions,
  }
}

beforeEach(() => {
  vi.mocked(listProjectMembers).mockReset()
  vi.mocked(listProjectInvites).mockReset().mockResolvedValue([])
  vi.mocked(getProjectRepoConfig).mockReset()
  vi.mocked(updateProjectRepoConfig).mockReset()
})

describe('useProjectSettings repo config', () => {
  it('ignores a stale response after switching projects', async () => {
    const projectA = deferred<ProjectMember[]>()
    vi.mocked(listProjectMembers).mockImplementation((_api, _token, projectKey) => (
      projectKey === 'a' ? projectA.promise : Promise.resolve([admin('b')])
    ))
    vi.mocked(getProjectRepoConfig).mockImplementation((_api, _token, projectKey) => (
      Promise.resolve(repoConfig(projectKey, `instructions-${projectKey}`))
    ))

    const { result, rerender } = renderHook(
      ({ projectKey, userId }) => useProjectSettings('/api', 'token', projectKey, userId),
      { initialProps: { projectKey: 'a', userId: 'admin-a' } },
    )
    await waitFor(() => expect(listProjectMembers).toHaveBeenCalledWith('/api', 'token', 'a'))

    rerender({ projectKey: 'b', userId: 'admin-b' })
    await waitFor(() => expect(result.current.repoConfig?.agentInstructions).toBe('instructions-b'))

    await act(async () => { projectA.resolve([admin('a')]); await projectA.promise })
    expect(result.current.repoConfig?.projectKey).toBe('b')
    expect(result.current.members).toEqual([admin('b')])
  })

  it('exposes an admin repo-config load failure instead of treating it as empty', async () => {
    vi.mocked(listProjectMembers).mockResolvedValue([admin('a')])
    vi.mocked(getProjectRepoConfig).mockRejectedValue(new Error('repo config unavailable'))

    const { result } = renderHook(() => useProjectSettings('/api', 'token', 'a', 'admin-a'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.repoConfig).toBeNull()
    expect(result.current.repoConfigError).toBe('repo config unavailable')
  })

  it('does not apply a completed save to a different project', async () => {
    const saveA = deferred<RepoConfig | null>()
    vi.mocked(listProjectMembers).mockImplementation((_api, _token, projectKey) => (
      Promise.resolve([admin(projectKey)])
    ))
    vi.mocked(getProjectRepoConfig).mockImplementation((_api, _token, projectKey) => (
      Promise.resolve(repoConfig(projectKey, `instructions-${projectKey}`))
    ))
    vi.mocked(updateProjectRepoConfig).mockImplementation((_api, _token, projectKey) => (
      projectKey === 'a' ? saveA.promise : Promise.resolve(repoConfig('b', 'saved-b'))
    ))

    const { result, rerender } = renderHook(
      ({ projectKey, userId }) => useProjectSettings('/api', 'token', projectKey, userId),
      { initialProps: { projectKey: 'a', userId: 'admin-a' } },
    )
    await waitFor(() => expect(result.current.repoConfig?.projectKey).toBe('a'))

    const pendingSave = result.current.saveAgentInstructions('saved-a')
    rerender({ projectKey: 'b', userId: 'admin-b' })
    await waitFor(() => expect(result.current.repoConfig?.projectKey).toBe('b'))

    await act(async () => { saveA.resolve(repoConfig('a', 'saved-a')); await pendingSave })
    expect(result.current.repoConfig?.projectKey).toBe('b')
    expect(result.current.repoConfig?.agentInstructions).toBe('instructions-b')
  })
})
