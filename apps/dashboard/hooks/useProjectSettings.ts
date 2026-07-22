import { useCallback, useEffect, useRef, useState } from 'react'
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
  repoConfigError: string | null
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
  const [repoConfigError, setRepoConfigError] = useState<string | null>(null)
  const [loadedProjectKey, setLoadedProjectKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentProjectKey = useRef(projectKey)
  const refreshSequence = useRef(0)
  currentProjectKey.current = projectKey

  const refresh = useCallback(async () => {
    if (!projectKey) return
    const sequence = ++refreshSequence.current
    const isCurrent = () => currentProjectKey.current === projectKey && refreshSequence.current === sequence
    setLoading(true)
    setError(null)
    setRepoConfigError(null)
    if (mocksEnabled) {
      if (!isCurrent()) return
      setMembers([{ userId: currentUserId, email: 'you@example.com', role: 'admin', createdAt: new Date().toISOString() }])
      setInvites([])
      setRepoConfig(null)
      setLoadedProjectKey(projectKey)
      setLoading(false)
      return
    }
    try {
      const [m, i] = await Promise.all([
        listProjectMembers(apiBase, accessToken, projectKey),
        listProjectInvites(apiBase, accessToken, projectKey).catch(() => [] as ProjectInvite[]),
      ])
      if (!isCurrent()) return

      let rc: RepoConfig | null = null
      let rcError: string | null = null
      const isProjectAdmin = m.some((member) => member.userId === currentUserId && member.role === 'admin')
      if (isProjectAdmin) {
        try {
          rc = await getProjectRepoConfig(apiBase, accessToken, projectKey)
        } catch (err) {
          rcError = err instanceof Error ? err.message : 'Failed to load repository configuration'
        }
      }
      if (!isCurrent()) return

      setMembers(m)
      setInvites(i)
      setRepoConfig(rc)
      setRepoConfigError(rcError)
      setLoadedProjectKey(projectKey)
    } catch (err) {
      if (!isCurrent()) return
      setMembers([])
      setInvites([])
      setRepoConfig(null)
      setRepoConfigError(null)
      setLoadedProjectKey(projectKey)
      setError(err instanceof Error ? err.message : 'Failed to load project settings')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [apiBase, accessToken, projectKey, currentUserId])

  useEffect(() => { refresh() }, [refresh])

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
    if (currentProjectKey.current === projectKey) {
      setRepoConfig(config)
      setRepoConfigError(null)
      setLoadedProjectKey(projectKey)
    }
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

  const hasCurrentProject = loadedProjectKey === projectKey
  const currentMembers = hasCurrentProject ? members : []
  const currentInvites = hasCurrentProject ? invites : []
  const currentRepoConfig = hasCurrentProject ? repoConfig : null
  const currentRepoConfigError = hasCurrentProject ? repoConfigError : null
  const currentError = hasCurrentProject ? error : null
  const currentIsAdmin = currentMembers.some((m) => m.userId === currentUserId && m.role === 'admin')

  return {
    members: currentMembers,
    invites: currentInvites,
    repoConfig: currentRepoConfig,
    repoConfigError: currentRepoConfigError,
    loading: hasCurrentProject ? loading : true,
    error: currentError,
    isAdmin: currentIsAdmin,
    refresh,
    rename,
    updateAllowedOrigins,
    saveAgentInstructions,
    invite,
    removeMember,
    cancelInvite,
  }
}
