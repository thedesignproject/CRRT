import { useCallback, useEffect, useState } from 'react'
import {
  cancelProjectInvite as apiCancelInvite,
  inviteProjectMember as apiInvite,
  listProjectInvites,
  listProjectMembers,
  removeProjectMember as apiRemoveMember,
  renameProject as apiRename,
  type Project,
  type ProjectInvite,
  type ProjectMember,
} from '../api'
import { mocksEnabled } from '../lib/mocks'

export interface UseProjectSettingsResult {
  members: ProjectMember[]
  invites: ProjectInvite[]
  loading: boolean
  error: string | null
  isAdmin: boolean
  refresh: () => Promise<void>
  rename: (name: string) => Promise<Project>
  invite: (email: string, role?: 'admin' | 'member') => Promise<void>
  removeMember: (userId: string) => Promise<void>
  cancelInvite: (email: string) => Promise<void>
}

/**
 * Loads a project's members + pending invites and exposes admin-gated
 * mutations. Each mutation refetches on success so the panel reflects server
 * state. Rename also bubbles up via `onRenamed` so the project tab bar (driven
 * by useProjects) refreshes.
 */
export function useProjectSettings(
  apiBase: string,
  accessToken: string,
  projectKey: string,
  currentUserId: string,
  onRenamed?: () => void,
): UseProjectSettingsResult {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [invites, setInvites] = useState<ProjectInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectKey) return
    setLoading(true)
    setError(null)
    if (mocksEnabled) {
      setMembers([{ userId: currentUserId, email: 'you@example.com', role: 'admin', createdAt: new Date().toISOString() }])
      setInvites([])
      setLoading(false)
      return
    }
    try {
      const [m, i] = await Promise.all([
        listProjectMembers(apiBase, accessToken, projectKey),
        listProjectInvites(apiBase, accessToken, projectKey).catch(() => [] as ProjectInvite[]),
      ])
      setMembers(m)
      setInvites(i)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project settings')
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken, projectKey, currentUserId])

  useEffect(() => { refresh() }, [refresh])

  const isAdmin = members.some((m) => m.userId === currentUserId && m.role === 'admin')

  const rename = useCallback(async (name: string) => {
    const project = await apiRename(apiBase, accessToken, projectKey, name)
    onRenamed?.()
    return project
  }, [apiBase, accessToken, projectKey, onRenamed])

  const invite = useCallback(async (email: string, role: 'admin' | 'member' = 'member') => {
    await apiInvite(apiBase, accessToken, projectKey, email, role)
    await refresh()
  }, [apiBase, accessToken, projectKey, refresh])

  const removeMember = useCallback(async (userId: string) => {
    await apiRemoveMember(apiBase, accessToken, projectKey, userId)
    await refresh()
  }, [apiBase, accessToken, projectKey, refresh])

  const cancelInvite = useCallback(async (email: string) => {
    await apiCancelInvite(apiBase, accessToken, projectKey, email)
    await refresh()
  }, [apiBase, accessToken, projectKey, refresh])

  return { members, invites, loading, error, isAdmin, refresh, rename, invite, removeMember, cancelInvite }
}
