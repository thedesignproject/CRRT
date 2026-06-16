import { useCallback, useEffect, useState } from 'react'
import { listAdminProjects, listAdminUsers, type AdminProject, type AdminUser } from '../api'

interface UseAdminDataResult {
  users: AdminUser[]
  projects: AdminProject[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Loads the super-admin overview (all users + all projects with comments) in
 * one shot. Mirrors `useProjects`' loading/error/refresh shape. Only mounted
 * once the user is confirmed to be a super admin.
 */
export function useAdminData(apiBase: string, accessToken: string): UseAdminDataResult {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, p] = await Promise.all([
        listAdminUsers(apiBase, accessToken),
        listAdminProjects(apiBase, accessToken),
      ])
      setUsers(u)
      setProjects(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { users, projects, loading, error, refresh }
}
