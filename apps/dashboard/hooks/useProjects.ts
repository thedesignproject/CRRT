import { useCallback, useEffect, useState } from 'react'
import { createProject as apiCreateProject, listProjects, type Project } from '../api'

export interface UseProjectsResult {
  projects: Project[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProject: (name: string) => Promise<Project>
}

export function useProjects(apiBase: string, reviewerToken: string): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listProjects(apiBase, reviewerToken)
      setProjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [apiBase, reviewerToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createProject = useCallback(async (name: string) => {
    const project = await apiCreateProject(apiBase, reviewerToken, name)
    setProjects((prev) => [...prev, project])
    return project
  }, [apiBase, reviewerToken])

  return { projects, loading, error, refresh, createProject }
}
