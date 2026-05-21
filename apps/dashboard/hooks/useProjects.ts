import { useCallback, useEffect, useState } from 'react'
import { createProject as apiCreateProject, listProjects, type Project } from '../api'
import { getMockProjects, mocksEnabled } from '../lib/mocks'

export interface UseProjectsResult {
  projects: Project[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProject: (name: string) => Promise<Project>
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

  const createProject = useCallback(async (name: string) => {
    if (mocksEnabled) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const project: Project = {
        publicKey: `proj_${slug || 'untitled'}`,
        slug: slug || 'untitled',
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setProjects((prev) => [...prev, project])
      return project
    }
    const project = await apiCreateProject(apiBase, accessToken, name)
    setProjects((prev) => [...prev, project])
    return project
  }, [apiBase, accessToken])

  return { projects, loading, error, refresh, createProject }
}
