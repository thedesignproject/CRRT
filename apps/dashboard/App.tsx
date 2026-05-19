import { useCallback, useEffect, useMemo, useState } from 'react'
import { updateImplementationStatus as apiUpdateImpl, updateReviewStatus as apiUpdateReview } from './api'
import { useProjects } from './hooks/useProjects'
import { useComments } from './hooks/useComments'
import { useAgentSession } from './hooks/useAgentSession'
import { useAuth } from './hooks/useAuth'
import { getDisplayStatus, isInactive, mapServerComment } from './lib/comment'
import { AGENTS, type Comment, type ImplStatus, type ReviewStatus, type StatusFilter } from './lib/types'
import { Header } from './components/Header'
import { CommentList } from './components/CommentList'
import { CommentDetail } from './components/CommentDetail'
import { AgentSidebar } from './components/AgentSidebar'
import { StatusBar } from './components/StatusBar'
import { CommandPalette } from './components/CommandPalette'
import { LoginPage } from './components/LoginPage'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REVIEWER_TOKEN = import.meta.env.VITE_REVIEWER_TOKEN || ''

export function App() {
  const { session, loading: authLoading, signIn, signOut } = useAuth()
  const { projects, loading: projectsLoading, error: projectsError, createProject } = useProjects(API_BASE, REVIEWER_TOKEN)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedCommentId, setSelectedCommentId] = useState<string>('')
  const { comments: serverComments, loading: commentsLoading, error: commentsError, refresh: refreshComments } = useComments(API_BASE, REVIEWER_TOKEN, selectedProject || null)
  const [comments, setComments] = useState<Comment[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('claude-code')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const { session: agentSession, shareState: agentShareState, events: agentEvents, error: agentError, copyPrompt } = useAgentSession(API_BASE, selectedProject || null)
  const agentConnected = (agentShareState?.presence?.length ?? 0) > 0
  const selectedAgentMeta = AGENTS.find((a) => a.id === selectedAgent) ?? AGENTS[0]
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  const [addProjectError, setAddProjectError] = useState<string | null>(null)
  const [addProjectBusy, setAddProjectBusy] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    try { return (localStorage.getItem('dashboard-theme') as 'light' | 'dark') || 'dark' } catch { return 'dark' }
  })
  const [, setTick] = useState(0)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
    try { localStorage.setItem('dashboard-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0].publicKey)
    }
  }, [projects, selectedProject])

  useEffect(() => {
    const next = serverComments.map(mapServerComment)
    setComments(next)
    setSelectedCommentId((current) => (current && next.some((c) => c.id === current) ? current : ''))
  }, [serverComments])

  const projectComments = comments

  const filteredComments = useMemo(() => {
    const filtered = statusFilter === 'all'
      ? projectComments
      : projectComments.filter((c) => getDisplayStatus(c) === statusFilter)

    return [...filtered].sort((a, b) => Number(isInactive(a)) - Number(isInactive(b)))
  }, [projectComments, statusFilter])

  const selectedComment = comments.find((c) => c.id === selectedCommentId) ?? null

  const counts = useMemo(() => projectComments.reduce(
    (acc, c) => {
      acc.all++
      const ds = getDisplayStatus(c)
      acc[ds]++
      return acc
    },
    { all: 0, open: 0, ready: 0, done: 0, rejected: 0 },
  ), [projectComments])

  const handleReviewStatus = useCallback(async (id: string, status: ReviewStatus) => {
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, reviewStatus: status, updatedAt: new Date().toISOString() } : c))
    try {
      await apiUpdateReview(API_BASE, REVIEWER_TOKEN, id, status)
    } catch (err) {
      console.error('Failed to update review status:', err)
      refreshComments()
    }
  }, [refreshComments])

  const handleToggleDone = useCallback(async (id: string) => {
    const current = comments.find((c) => c.id === id)
    if (!current) return
    const nextStatus: ImplStatus = current.implementationStatus === 'done' ? 'unassigned' : 'done'
    setComments((prev) => prev.map((c) => c.id === id
      ? { ...c, implementationStatus: nextStatus, updatedAt: new Date().toISOString() }
      : c))
    try {
      await apiUpdateImpl(API_BASE, REVIEWER_TOKEN, id, nextStatus)
    } catch (err) {
      console.error('Failed to update implementation status:', err)
      refreshComments()
    }
  }, [comments, refreshComments])

  const toggleReview = useCallback((c: Comment, target: 'accepted' | 'rejected') => {
    handleReviewStatus(c.id, c.reviewStatus === target ? 'open' : target)
  }, [handleReviewStatus])

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitBulkMode = useCallback(() => {
    setBulkMode(false)
    setBulkSelectedIds(new Set())
  }, [])

  const applyBulkAction = useCallback(async (action: 'ready' | 'done' | 'reject') => {
    const ids = Array.from(bulkSelectedIds)
    if (ids.length === 0) return
    const idSet = new Set(ids)

    setComments((prev) => prev.map((c) => {
      if (!idSet.has(c.id)) return c
      const ts = new Date().toISOString()
      if (action === 'ready') return { ...c, reviewStatus: 'accepted' as ReviewStatus, updatedAt: ts }
      if (action === 'done') return { ...c, reviewStatus: 'accepted' as ReviewStatus, implementationStatus: 'done' as ImplStatus, updatedAt: ts }
      return { ...c, reviewStatus: 'rejected' as ReviewStatus, updatedAt: ts }
    }))
    exitBulkMode()

    const calls: Promise<unknown>[] = ids.flatMap((id) => {
      if (action === 'ready') return [apiUpdateReview(API_BASE, REVIEWER_TOKEN, id, 'accepted')]
      if (action === 'reject') return [apiUpdateReview(API_BASE, REVIEWER_TOKEN, id, 'rejected')]
      return [
        apiUpdateReview(API_BASE, REVIEWER_TOKEN, id, 'accepted'),
        apiUpdateImpl(API_BASE, REVIEWER_TOKEN, id, 'done'),
      ]
    })

    const results = await Promise.allSettled(calls)
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      console.error(`Bulk ${action}: ${failed.length}/${calls.length} calls failed`, failed)
      refreshComments()
    }
  }, [bulkSelectedIds, exitBulkMode, refreshComments])

  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredComments.map((c) => c.id)
    setBulkSelectedIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(visibleIds)
    })
  }, [filteredComments])

  const selectedIdx = filteredComments.findIndex((c) => c.id === selectedCommentId)

  const goNext = useCallback(() => {
    const next = filteredComments[selectedIdx + 1]
    if (next) setSelectedCommentId(next.id)
  }, [filteredComments, selectedIdx])

  const goPrev = useCallback(() => {
    const prev = filteredComments[selectedIdx - 1]
    if (prev) setSelectedCommentId(prev.id)
  }, [filteredComments, selectedIdx])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘K must run before the input-focus / palette-open guards below — it's the global escape hatch.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
        return
      }

      if (e.key === 'Escape' && cmdOpen) {
        setCmdOpen(false)
        return
      }

      if (e.key === 'Escape' && bulkMode) {
        exitBulkMode()
        return
      }

      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (cmdOpen) return

      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); goNext() }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
      if (e.key === ' ') { e.preventDefault(); goNext() }

      if (selectedComment) {
        if (e.key === 'a') toggleReview(selectedComment, 'accepted')
        if (e.key === 'd') toggleReview(selectedComment, 'rejected')
        if (e.key === 'm') handleToggleDone(selectedComment.id)
      }

      if (e.key === 's') setSidebarOpen((v) => !v)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, selectedComment, toggleReview, handleToggleDone, cmdOpen, bulkMode, exitBulkMode])

  const handleCmdSelect = useCallback((commentId: string) => {
    setSelectedCommentId(commentId)
    setCmdOpen(false)
  }, [])

  const selectFilter = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter)
    setSelectedCommentId('')
  }, [])

  const handleCmdAction = useCallback((action: string) => {
    if (action === 'toggle-sidebar') setSidebarOpen((v) => !v)
    if (action === 'filter-all') selectFilter('all')
    if (action === 'filter-open') selectFilter('open')
    if (action === 'filter-ready') selectFilter('ready')
    if (action === 'filter-done') selectFilter('done')
    if (selectedComment && action === 'accept') toggleReview(selectedComment, 'accepted')
    if (selectedComment && action === 'reject') toggleReview(selectedComment, 'rejected')
    if (selectedComment && action === 'done') handleToggleDone(selectedComment.id)
    setCmdOpen(false)
  }, [selectedComment, toggleReview, handleToggleDone, selectFilter])

  const handleCopySessionLink = useCallback(async () => {
    if (!agentSession) return
    setCopyStatus('copying')
    try {
      await copyPrompt(selectedAgentMeta.target)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    } catch (err) {
      console.error('Copy prompt failed:', err)
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    }
  }, [agentSession, copyPrompt, selectedAgentMeta])

  const handleAddProject = useCallback(async (name: string) => {
    setAddProjectError(null)
    setAddProjectBusy(true)
    try {
      const project = await createProject(name)
      setSelectedProject(project.publicKey)
      setStatusFilter('all')
      setSelectedCommentId('')
      setAddProjectOpen(false)
    } catch (err) {
      setAddProjectError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setAddProjectBusy(false)
    }
  }, [createProject])

  if (authLoading) return null
  if (!session) return <LoginPage onSignIn={signIn} />

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        commentsLoading={commentsLoading}
        selectedProject={selectedProject}
        commentCount={comments.length}
        setSelectedProject={setSelectedProject}
        setStatusFilter={setStatusFilter}
        setSelectedCommentId={setSelectedCommentId}
        addProjectOpen={addProjectOpen}
        setAddProjectOpen={setAddProjectOpen}
        onAddProject={handleAddProject}
        addProjectBusy={addProjectBusy}
        addProjectError={addProjectError}
        onOpenCmd={() => setCmdOpen(true)}
        theme={theme}
        toggleTheme={() => setTheme((t) => t === 'light' ? 'dark' : 'light')}
        userEmail={session?.user?.email ?? undefined}
        onSignOut={session?.user ? signOut : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <CommentList
          filteredComments={filteredComments}
          counts={counts}
          statusFilter={statusFilter}
          selectFilter={selectFilter}
          bulkMode={bulkMode}
          enterBulkMode={() => setBulkMode(true)}
          exitBulkMode={exitBulkMode}
          bulkSelectedIds={bulkSelectedIds}
          toggleSelectAllVisible={toggleSelectAllVisible}
          applyBulkAction={applyBulkAction}
          toggleBulkSelect={toggleBulkSelect}
          commentsLoading={commentsLoading}
          commentsError={commentsError}
          selectedCommentId={selectedCommentId}
          setSelectedCommentId={setSelectedCommentId}
        />

        <CommentDetail
          selectedComment={selectedComment}
          selectedProject={selectedProject}
          apiBase={API_BASE}
          commentsLoading={commentsLoading}
          commentsError={commentsError}
          projectComments={projectComments}
          filteredComments={filteredComments}
          selectedIdx={selectedIdx}
          goPrev={goPrev}
          goNext={goNext}
          toggleReview={toggleReview}
          handleToggleDone={handleToggleDone}
        />

        {sidebarOpen && (
          <AgentSidebar
            apiBase={API_BASE}
            selectedProject={selectedProject}
            agentSession={agentSession}
            agentShareState={agentShareState}
            agentEvents={agentEvents}
            agentError={agentError}
            agentConnected={agentConnected}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
            selectedAgentMeta={selectedAgentMeta}
            agentDropdownOpen={agentDropdownOpen}
            setAgentDropdownOpen={setAgentDropdownOpen}
            copyStatus={copyStatus}
            onCopySessionLink={handleCopySessionLink}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      <StatusBar sidebarOpen={sidebarOpen} onShowSidebar={() => setSidebarOpen(true)} />

      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          comments={projectComments}
          onSelect={handleCmdSelect}
          onAction={handleCmdAction}
          selectedCommentId={selectedCommentId}
        />
      )}
    </div>
  )
}
