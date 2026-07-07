import { useCallback, useEffect, useState } from 'react'
import {
  cancelProjectInvite as apiCancelInvite,
  getProjectRepoConfig,
  inviteProjectMember as apiInvite,
  listProjectInvites,
  listProjectMembers,
  removeProjectMember as apiRemoveMember,
  renameProject as apiRename,
  updateProjectAllowedOrigins as apiUpdateAllowedOrigins,
  updateProjectRepoConfig,
  type Project,
  type ProjectInvite,
  type ProjectMember,
  type RepoConfig,
} from '../api'
import { mocksEnabled } from '../lib/mocks'

export interface UseProjectSettingsResult {
  members: ProjectMember[]
  invites: ProjectInvite[]
  repoConfig: RepoConfig | null
  loading: boolean
  error: string | null
  isAdmin: boolean
  refresh: () => Promise<void>
  rename: (name: string) => Promise<Project>
  updateAllowedOrigins: (domains: string[]) => Promise<Project>
  saveAgentInstructions: (value: string) => Promise<RepoConfig | null>
  invite: (email: string, role?: 'admin' | 'member') => Promise<void>
  removeMember: (userId: string) => Promise<void>
  cancelInvite: (email: string) => Promise<void>
}

/**
 * Loads a project's members + pending invites and exposes admin-gated
 * mutations. Each mutation refetches on success so the panel reflects server
 * state. Project mutations (rename, allowlist) also bubble up via
 * `onProjectUpdated` so the project list (driven by useProjects) refreshes.
 */
export function useProjectSettings(
  apiBase: string,
  accessToken: string,
  projectKey: string,
  currentUserId: string,
  onProjectUpdated?: () => void,
): UseProjectSettingsResult {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [invites, setInvites] = useState<ProjectInvite[]>([])
  const [repoConfig, setRepoConfig] = useState<RepoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectKey) return
    setLoading(true)
    setError(null)
    if (mocksEnabled) {
      setMembers([{ userId: currentUserId, email: 'you@example.com', role: 'admin', createdAt: new Date().toISOString() }])
      setInvites([])
      setRepoConfig(null)
      setLoading(false)
      return
    }
    try {
      // Repo config is admin-gated (403 for members): degrade to null rather
      // than failing the whole settings panel, same as invites.
      const [m, i, rc] = await Promise.all([
        listProjectMembers(apiBase, accessToken, projectKey),
        listProjectInvites(apiBase, accessToken, projectKey).catch(() => [] as ProjectInvite[]),
        getProjectRepoConfig(apiBase, accessToken, projectKey).catch(() => null),
      ])
      setMembers(m)
      setInvites(i)
      setRepoConfig(rc)
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
    onProjectUpdated?.()
    return project
  }, [apiBase, accessToken, projectKey, onProjectUpdated])

  const updateAllowedOrigins = useCallback(async (domains: string[]) => {
    const project = await apiUpdateAllowedOrigins(apiBase, accessToken, projectKey, domains)
    onProjectUpdated?.()
    return project
  }, [apiBase, accessToken, projectKey, onProjectUpdated])

  const saveAgentInstructions = useCallback(async (value: string) => {
    // '' clears the field server-side; the response is the fresh config.
    const config = await updateProjectRepoConfig(apiBase, accessToken, projectKey, { agentInstructions: value })
    setRepoConfig(config)
    return config
  }, [apiBase, accessToken, projectKey])

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

  return { members, invites, repoConfig, loading, error, isAdmin, refresh, rename, updateAllowedOrigins, saveAgentInstructions, invite, removeMember, cancelInvite }
}
