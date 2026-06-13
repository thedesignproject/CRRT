import { useCallback, useEffect, useState } from 'react'
import {
  checkProjectKeyAvailability as apiCheckAvailability,
  claimProject as apiClaimProject,
  listProjects,
  type Project,
  type ProjectKeyAvailability,
} from '../api'
import { getMockProjects, mocksEnabled } from '../lib/mocks'
import { slugify } from '../lib/utils'

export interface UseProjectsResult {
  projects: Project[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  claimProject: (projectKey: string, name: string) => Promise<Project>
  checkAvailability: (key: string) => Promise<ProjectKeyAvailability>
}

export function useProjects(apiBase: string, accessToken: string): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (mocksEnabled) {
      setProjects(getMockProjects())
      setLoading(false)
      return
    }
    try {
      const data = await listProjects(apiBase, accessToken)
      setProjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const checkAvailability = useCallback(async (key: string): Promise<ProjectKeyAvailability> => {
    if (mocksEnabled) {
      return { key, available: true, suggestion: key }
    }
    return apiCheckAvailability(apiBase, accessToken, key)
  }, [apiBase, accessToken])

  const claimProject = useCallback(async (projectKey: string, name: string) => {
    if (mocksEnabled) {
      const project: Project = {
        publicKey: projectKey,
        slug: slugify(name) || projectKey,
        name,
        allowedOrigins: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setProjects((prev) => [...prev, project])
      return project
    }
    const project = await apiClaimProject(apiBase, accessToken, projectKey, name)
    setProjects((prev) => [...prev, project])
    return project
  }, [apiBase, accessToken])

  return { projects, loading, error, refresh, claimProject, checkAvailability }
}
