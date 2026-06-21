import { useCallback, useEffect, useState } from 'react'
import {
  getAdminStats,
  listAdminProjects,
  listAdminUsers,
  type AdminProject,
  type AdminProjectSort,
  type AdminSortDirection,
  type AdminStats,
  type AdminUser,
} from '../api'
import {
  getMockAdminProjectsPage,
  getMockAdminStats,
  getMockAdminUsersPage,
  mocksEnabled,
} from '../lib/mocks'

const PAGE_SIZE = 50

interface UseAdminDataResult {
  stats: AdminStats | null
  users: AdminUser[]
  projects: AdminProject[]
  loading: boolean
  usersLoadingMore: boolean
  projectsLoadingMore: boolean
  error: string | null
  usersHasMore: boolean
  projectsHasMore: boolean
  projectSort: AdminProjectSort
  projectDirection: AdminSortDirection
  refresh: () => Promise<void>
  loadMoreUsers: () => Promise<void>
  loadMoreProjects: () => Promise<void>
  setProjectSort: (sort: AdminProjectSort) => void
}

export function useAdminData(apiBase: string, accessToken: string): UseAdminDataResult {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [loading, setLoading] = useState(true)
  const [usersLoadingMore, setUsersLoadingMore] = useState(false)
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usersCursor, setUsersCursor] = useState<string | null>(null)
  const [projectsCursor, setProjectsCursor] = useState<string | null>(null)
  const [usersHasMore, setUsersHasMore] = useState(false)
  const [projectsHasMore, setProjectsHasMore] = useState(false)
  const [projectSort, setProjectSortState] = useState<AdminProjectSort>('lastCommentAt')
  const [projectDirection, setProjectDirection] = useState<AdminSortDirection>('desc')

  const fetchUsers = useCallback(async (cursor?: string | null) => {
    if (mocksEnabled) return getMockAdminUsersPage({ cursor, limit: PAGE_SIZE })
    return listAdminUsers(apiBase, accessToken, { cursor, limit: PAGE_SIZE })
  }, [apiBase, accessToken])

  const fetchProjects = useCallback(async (
    cursor?: string | null,
    sort: AdminProjectSort = projectSort,
    direction: AdminSortDirection = projectDirection,
  ) => {
    const opts = { cursor, limit: PAGE_SIZE, sort, direction }
    if (mocksEnabled) return getMockAdminProjectsPage(opts)
    return listAdminProjects(apiBase, accessToken, opts)
  }, [apiBase, accessToken, projectSort, projectDirection])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (mocksEnabled) {
        const usersPage = getMockAdminUsersPage({ limit: PAGE_SIZE })
        const projectsPage = getMockAdminProjectsPage({ limit: PAGE_SIZE, sort: projectSort, direction: projectDirection })
        setStats(getMockAdminStats())
        setUsers(usersPage.items)
        setProjects(projectsPage.items)
        setUsersCursor(usersPage.nextCursor)
        setProjectsCursor(projectsPage.nextCursor)
        setUsersHasMore(usersPage.hasMore)
        setProjectsHasMore(projectsPage.hasMore)
        return
      }
      const [nextStats, usersPage, projectsPage] = await Promise.all([
        getAdminStats(apiBase, accessToken),
        listAdminUsers(apiBase, accessToken, { limit: PAGE_SIZE }),
        listAdminProjects(apiBase, accessToken, { limit: PAGE_SIZE, sort: projectSort, direction: projectDirection }),
      ])
      setStats(nextStats)
      setUsers(usersPage.items)
      setProjects(projectsPage.items)
      setUsersCursor(usersPage.nextCursor)
      setProjectsCursor(projectsPage.nextCursor)
      setUsersHasMore(usersPage.hasMore)
      setProjectsHasMore(projectsPage.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken, projectSort, projectDirection])

  const loadMoreUsers = useCallback(async () => {
    if (!usersCursor || usersLoadingMore) return
    setUsersLoadingMore(true)
    setError(null)
    try {
      const page = await fetchUsers(usersCursor)
      setUsers((prev) => [...prev, ...page.items])
      setUsersCursor(page.nextCursor)
      setUsersHasMore(page.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setUsersLoadingMore(false)
    }
  }, [fetchUsers, usersCursor, usersLoadingMore])

  const loadMoreProjects = useCallback(async () => {
    if (!projectsCursor || projectsLoadingMore) return
    setProjectsLoadingMore(true)
    setError(null)
    try {
      const page = await fetchProjects(projectsCursor)
      setProjects((prev) => [...prev, ...page.items])
      setProjectsCursor(page.nextCursor)
      setProjectsHasMore(page.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setProjectsLoadingMore(false)
    }
  }, [fetchProjects, projectsCursor, projectsLoadingMore])

  const setProjectSort = useCallback((sort: AdminProjectSort) => {
    setProjectSortState((current) => {
      if (current === sort) {
        setProjectDirection((dir) => (dir === 'desc' ? 'asc' : 'desc'))
        return current
      }
      setProjectDirection('desc')
      return sort
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    stats,
    users,
    projects,
    loading,
    usersLoadingMore,
    projectsLoadingMore,
    error,
    usersHasMore,
    projectsHasMore,
    projectSort,
    projectDirection,
    refresh,
    loadMoreUsers,
    loadMoreProjects,
    setProjectSort,
  }
}
