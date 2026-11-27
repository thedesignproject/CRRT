import posthog from '../posthog'
import { useKeyboardShortcuts } from '../../src/lib/useKeyboardShortcuts'
import { useFeedbackMutationError } from './hooks/useFeedbackMutationError'
import { WidgetAuthPage } from './components/WidgetAuthPage'
import { useAccessReviewLink } from './hooks/useAccessReviewLink'
import { SuggestedProjects } from './components/SuggestedProjects'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InboxMoveUndo } from './components/InboxMoveUndo'
import type { InboxUndoItem } from './api'
import { acceptInvite as apiAcceptInvite, beginBillingCheckout, createShare, getPrompt, updateCommentVisibility as apiUpdateVisibility, updateImplementationStatus as apiUpdateImpl, updateReviewStatus as apiUpdateReview } from './api'
import { useProjects } from './hooks/useProjects'
import { useStorybookConnected } from './hooks/useStorybookConnected'
import { useComments } from './hooks/useComments'
import { useAgentSession } from './hooks/useAgentSession'
import { useAuth } from './hooks/useAuth'
import { useSuperAdmin } from './hooks/useSuperAdmin'
import { getDisplayStatus, isInactive, mapServerComment } from './lib/comment'
import { applyDashboardTheme, getDashboardTheme } from './lib/theme'
import { relPath, route } from './lib/routes'
import { billingPlanSelection } from './lib/access-review-link'
import { AGENTS, type Comment, type ImplStatus, type ReviewStatus, type StatusFilter } from './lib/types'
import { BillingPage } from './components/BillingPage'
import { UserMenu } from './components/UserMenu'
import { TrialOffer } from './components/TrialOffer'
import { useProjectGate } from './hooks/useProjectGate'
import { DashboardShell } from './components/DashboardShell'
import { CommentList } from './components/CommentList'
import { CommentDetail } from './components/CommentDetail'
import { NextStepsPage } from './components/NextStepsPage'
import { useDirectDelivery } from './hooks/useDirectDelivery'
import { AgentRunsPage } from './components/AgentRunsPage'
import { AgentLauncher } from './components/AgentLauncher'
import { StatusBar } from './components/StatusBar'
import { CommandPalette } from './components/CommandPalette'
import { LoginPage } from './components/LoginPage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import { NewProjectPage } from './components/NewProjectPage'
import { ProjectSettings } from './components/ProjectSettings'
import { SuperAdminPanel } from './components/SuperAdminPanel'
import { ExtensionCommentsPage } from './components/ExtensionCommentsPage'
import { BulkActionBar } from './components/BulkActionBar'
import { Spinner } from './components/primitives'
import { ProductAuditPage } from './components/ProductAuditPage'
import { McpAuthPage } from './components/McpAuthPage'
import { ExtensionAuthPage } from './components/ExtensionAuthPage'
import { RecordingSharePage } from './components/RecordingSharePage'
import { RecordingsPage } from './components/RecordingsPage'
import { BrainPage } from './components/BrainPage'
import { DocumentUnlockPage } from './documents/DocumentUnlockPage'
import { documentRoute } from './documents/DocumentRoute'
import { DocumentRecoveryProvider } from './documents/DocumentRecovery'
import { DocumentsPage } from './documents/DocumentsPage'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://crrt.ai/api'
export function App() {
  return <DocumentRecoveryProvider><AppRoutes /></DocumentRecoveryProvider>
}

function AppRoutes() {
  const { session, user, loading: authLoading, signOut } = useAuth()
  const [pathname, setPathname] = useState(typeof window === 'undefined' ? '/' : relPath(window.location.pathname))

  useEffect(() => {
    function onPop() {
      setPathname(relPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // /reset-password handles its own auth state via the recovery deep link;
  // render it regardless of session so the user can complete the flow even
  // if their previous session is stale.
  if (pathname === '/reset-password') return <ResetPasswordPage />
  // Recovery can fail while another session is still signed in. Let the user
  // request a fresh link without being routed into the dashboard.
  if (pathname === '/forgot-password') return <LoginPage />
  const sharedDocument = documentRoute(pathname, API_BASE, session?.access_token ?? null, user?.id ?? null, user?.email ?? '')
  if (sharedDocument) return sharedDocument

  if (pathname === '/recording' && !window.location.search) return <RecordingSharePage apiBase={API_BASE} />

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size={20} />
      </div>
    )
  }

  if (pathname === '/document-unlock') return <DocumentUnlockPage apiBase={API_BASE} accessToken={session?.access_token ?? null} />

  if (pathname === '/mcp-auth') return <McpAuthPage apiBase={API_BASE} accessToken={session?.access_token ?? null} />

  if (pathname === '/widget-auth') return <WidgetAuthPage apiBase={API_BASE} accessToken={session?.access_token ?? null} />

  if (pathname === '/extension-auth') {
    return <ExtensionAuthPage apiBase={API_BASE} accessToken={session?.access_token ?? null} />
  }

  if (!session || !user) {
    if (pathname === '/billing') {
      // AppSumo buyers land here from /appsumo; return them to the redeem field.
      const search = new URLSearchParams(window.location.search)
      const initialMode = search.get('auth') === 'signup' ? 'signup' : undefined
      search.delete('auth')
      const query = search.toString()
      return <LoginPage initialMode={initialMode} continuationPath={route('/billing') + (query ? `?${query}` : '')} />
    }
    return <LoginPage continuationPath={pathname === '/documents' ? route('/documents') + window.location.search : undefined} />
  }
  if (pathname === '/documents') return <DocumentsPage key={user.id} userId={user.id} apiBase={API_BASE} session={session.access_token} author={user.email ?? 'Project member'} />

  const checkoutState = new URLSearchParams(window.location.search).get('billingState') ?? undefined
  const initialPlan = billingPlanSelection(window.location.search)
  if (pathname === '/billing' || checkoutState || initialPlan) return <BillingPage apiBase={API_BASE} accessToken={session.access_token} email={user.email} checkoutState={checkoutState} initialPlan={initialPlan} />

  const auditMatch = pathname.match(/^\/audits\/([^/]+)$/)
  if (auditMatch) return <ProductAuditPage apiBase={API_BASE} accessToken={session.access_token} auditId={decodeURIComponent(auditMatch[1])} />
  return <AuthenticatedApp accessToken={session.access_token} user={user} onSignOut={signOut} />
}

function AuthenticatedApp({ accessToken, user, onSignOut }: { accessToken: string; user: import('@supabase/supabase-js').User; onSignOut: () => void }) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const { projects, loading: projectsLoading, error: projectsError, claimProject, checkAvailability, refresh: refreshProjects } = useProjects(API_BASE, accessToken)
  useEffect(() => {
    const onFocus = () => { void refreshProjects() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshProjects])
  const { superadmin } = useSuperAdmin(API_BASE, accessToken)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [view, setView] = useState<'feedback' | 'settings' | 'super-admin' | 'extension-comments' | 'recordings' | 'recording' | 'brain' | 'next-steps' | 'agent-runs'>(() => {
    if (relPath(window.location.pathname) === '/recording') return 'recording'
    const requested = new URLSearchParams(window.location.search).get('view')
    return requested === 'extension-comments' || requested === 'recordings' ? requested : 'feedback'
  })
  useEffect(() => {
    if (view === 'recording' || relPath(window.location.pathname) !== '/recording') return
    const query = view === 'recordings' ? '?view=recordings' : view === 'extension-comments' ? '?view=extension-comments' : ''
    window.history.replaceState(null, '', `${route('/')}${query}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [view])
  // Set only when Settings is opened from the checklist's "Connect Storybook" step.
  const [connectStorybook, setConnectStorybook] = useState(false)
  const openStorybookSetup = useCallback(() => {
    setConnectStorybook(true)
    setView('settings')
  }, [])
  const openAccessReview = useCallback((project: string) => {
    setConnectStorybook(false)
    setSelectedProject(project)
    setView('settings')
  }, [])
  const accessReviewError = useAccessReviewLink(projects, projectsLoading, projectsError, openAccessReview)
  const accessReviewNotice = accessReviewError && <p role="alert" className="p-4 text-sm">{accessReviewError}</p>
  const [pendingInvite, setPendingInvite] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [selectedCommentId, setSelectedCommentId] = useState<string>('')
  const [pendingCommentSelection, setPendingCommentSelection] = useState<{ projectKey: string; commentId: string } | null>(null)
  const { comments: serverComments, commentsProjectId, loading: commentsLoading, error: commentsError, refresh: refreshComments, refreshInBackground: refreshCommentsInBackground } = useComments(API_BASE, accessToken, selectedProject || null)
  const [comments, setComments] = useState<Comment[]>([])
  const feedbackScopeKey = JSON.stringify([accessToken, selectedProject, view])
  const feedbackWrites = useRef({ key: feedbackScopeKey, version: 0, pending: new Set<Promise<unknown>>() })
  if (feedbackWrites.current.key !== feedbackScopeKey) {
    feedbackWrites.current = { key: feedbackScopeKey, version: 0, pending: new Set() }
  }
  useEffect(() => () => {
    feedbackWrites.current = { ...feedbackWrites.current, pending: new Set() }
  }, [])
  const trackFeedbackWrite = useCallback(async <T,>(operation: Promise<T>) => {
    const scope = feedbackWrites.current
    scope.version++
    scope.pending.add(operation)
    try {
      return await operation
    } finally {
      scope.pending.delete(operation)
    }
  }, [])
  const reconcileFeedback = useCallback(async (scope: typeof feedbackWrites.current) => {
    while (feedbackWrites.current === scope) {
      while (scope.pending.size) await Promise.allSettled([...scope.pending])
      if (feedbackWrites.current !== scope) return
      const version = scope.version
      await refreshComments(() => feedbackWrites.current === scope && scope.version === version)
      // A write during the fetch invalidates its data; reconcile again once idle.
      if (scope.version === version) return
    }
  }, [refreshComments])
  const reviewRequests = useRef(new Map<string, symbol>())
  const [cmdOpen, setCmdOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  // Bumped on every New project click so the page starts blank again.
  const [newProjectRun, setNewProjectRun] = useState(0)
  const projectGate = useProjectGate(API_BASE, user.id, accessToken)
  // Without a plan, project creation would fail; send owners to Billing instead.
  const openNewProject = () => {
    if (projectGate.planRequired) {
      window.location.assign(route('/billing'))
      return
    }
    setAddProjectError(null)
    setView('feedback')
    setAddProjectOpen(true)
    setNewProjectRun((run) => run + 1)
  }
  const [selectedAgent, setSelectedAgent] = useState('claude-code')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const mutation = useFeedbackMutationError(`${accessToken}:${selectedProject}`)
  const activeProject = projects.find((p) => p.publicKey === selectedProject) ?? null
  // Fail closed while project access is loading. The fallback only keeps
  // backwards compatibility for project fixtures/API responses that predate
  // explicit capabilities.
  const canManageFeedback = !mutation.blocked && activeProject
    ? activeProject.capabilities?.includes('feedback:manage') ?? true
    : false
  const canOperateAgent = !mutation.blocked && activeProject
    ? activeProject.capabilities?.includes('agent:operate') ?? true
    : false
  const canOpenAgentPanel = Boolean(selectedProject) && activeProject !== null && canOperateAgent
  const agentUnavailableReason = !selectedProject || activeProject === null
    ? 'Select a project to use Agents.'
    : 'Agents are unavailable for your project role.'
  // Next steps and Agent runs belong to the selected project and need agent access.
  const agentView = canOpenAgentPanel && (view === 'next-steps' || view === 'agent-runs') ? view : null
  const canManageProject = activeProject
    ? activeProject.capabilities?.includes('project:manage') ?? true
    : false
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  // Agents work on the selected feedback when a selection includes ready items, otherwise on everything ready.
  const readyAgentComments = useMemo(() => {
    if (commentsProjectId !== selectedProject) return []
    const ready = comments.filter((comment) => getDisplayStatus(comment) === 'ready' && comment.visibility === 'shared')
    const selected = bulkMode ? ready.filter((comment) => bulkSelectedIds.has(comment.id)) : []
    return selected.length > 0 ? selected : ready
  }, [comments, commentsProjectId, selectedProject, bulkMode, bulkSelectedIds])
  const readyAgentCommentIds = useMemo(() => readyAgentComments.map((comment) => comment.id), [readyAgentComments])
  const agentProject = canOpenAgentPanel && selectedProject ? selectedProject : null
  const { session: agentSession, shareState: agentShareState, events: agentEvents, error: agentError, errorCode: agentErrorCode, copyPrompt, adoptSession, retry: retryAgentSession } = useAgentSession(
    API_BASE,
    accessToken,
    agentProject,
    readyAgentCommentIds,
    agentView !== null,
    user.id,
  )
  const directDelivery = useDirectDelivery(API_BASE, accessToken, agentProject, agentView === 'next-steps')
  const activeAgentShare = agentShareState
    && agentShareState.share.id === agentSession?.shareId
    && agentShareState.project.publicKey === selectedProject
    ? agentShareState : null
  const agentConnected = (activeAgentShare?.presence?.length ?? 0) > 0
  const agentQueueComments = (activeAgentShare?.comments ?? []).map(mapServerComment)
    .filter((comment) => comment.visibility === 'shared')
  const selectedAgentMeta = AGENTS.find((a) => a.id === selectedAgent) ?? AGENTS[0]
  const bulkGeneration = useRef(0)
  const readyUndoRequest = useRef<symbol | null>(null)
  const clearReadyUndo = useCallback(() => {
    if (readyUndoRequest.current) {
      readyUndoRequest.current = null
      setBulkActionBusy(false)
    }
    setReadyUndo([])
  }, [])
  useEffect(() => {
    bulkGeneration.current++
    setBulkActionBusy(false)
    clearReadyUndo()
  }, [selectedProject, view, accessToken, clearReadyUndo])
  const [inboxUndo,setInboxUndo]=useState<{actor:string;projectId:string;items:InboxUndoItem[]}|null>(null)
  const [readyUndo, setReadyUndo] = useState<Array<Comment & { undoVersion: string; undoImplementation?: ImplStatus; undoToken?: string; undoAction?: 'reopen' | 'reject' }>>([])
  const [bulkActionBusy, setBulkActionBusy] = useState(false)
  const [bulkActionError, setBulkActionError] = useState('')
  const [pendingBulkSelection, setPendingBulkSelection] = useState<{ projectKey: string; commentIds: string[] } | null>(null)
  const [bulkTransitionNotice, setBulkTransitionNotice] = useState('')
  const [addProjectError, setAddProjectError] = useState<string | null>(null)
  const [theme, setTheme] = useState(getDashboardTheme)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!pendingInvite) return
    let current = true
    apiAcceptInvite(API_BASE, accessToken, pendingInvite)
      .then(() => {
        if (!current) return
        setSelectedProject(pendingInvite)
        setView('feedback')
        void refreshProjects()
      })
      .catch((error) => console.warn('Could not accept project invitation', error))
      .finally(() => {
        if (!current) return
        const url = new URL(window.location.href)
        url.searchParams.delete('invite'); url.searchParams.delete('email')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        setPendingInvite(null)
      })
    return () => { current = false }
  }, [accessToken, pendingInvite, refreshProjects])

  useEffect(() => {
    applyDashboardTheme(theme)
  }, [theme])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (view !== 'extension-comments' && view !== 'recordings' && view !== 'recording' && view !== 'brain' && !selectedProject && projects.length > 0) {
      setSelectedProject(current => current || projects[0].publicKey)
    }
  }, [projects, selectedProject, view])

  useEffect(() => {
    const next = serverComments.map(mapServerComment)
    setComments(next)
    if (
      pendingBulkSelection &&
      pendingBulkSelection.projectKey === selectedProject &&
      commentsProjectId === selectedProject
    ) {
      const nextIds = new Set(next.map((comment) => comment.id))
      const available = pendingBulkSelection.commentIds.filter((id) => nextIds.has(id))
      setBulkSelectedIds(new Set(available))
      setBulkMode(available.length > 0)
      setPendingBulkSelection(null)
    }
    setSelectedCommentId((current) => {
      if (
        pendingCommentSelection &&
        pendingCommentSelection.projectKey === selectedProject &&
        commentsProjectId === selectedProject
      ) {
        return next.some((c) => c.id === pendingCommentSelection.commentId)
          ? pendingCommentSelection.commentId
          : current && next.some((c) => c.id === current) ? current : ''
      }
      return current && next.some((c) => c.id === current) ? current : ''
    })
    if (
      pendingCommentSelection &&
      pendingCommentSelection.projectKey === selectedProject &&
      commentsProjectId === selectedProject &&
      next.some((c) => c.id === pendingCommentSelection.commentId)
    ) {
      setPendingCommentSelection(null)
    }
  }, [serverComments, commentsProjectId, pendingBulkSelection, pendingCommentSelection, selectedProject])

  const projectComments = comments
  // Only asked while the empty project's checklist is on screen, and only for owners.
  const storybookConnected = useStorybookConnected(API_BASE, accessToken, selectedProject, activeProject?.role === 'owner' && !commentsLoading && !commentsError && commentsProjectId === selectedProject && projectComments.length === 0)
  const selectedBulkComments = useMemo(
    () => projectComments.filter((comment) => bulkSelectedIds.has(comment.id)),
    [bulkSelectedIds, projectComments],
  )
  const selectedReadyCount = useMemo(
    () => selectedBulkComments.filter((comment) => getDisplayStatus(comment) === 'ready').length,
    [selectedBulkComments],
  )
  const allSelectedReady = selectedBulkComments.length > 0 && selectedReadyCount === selectedBulkComments.length

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
    { all: 0, open: 0, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 },
  ), [projectComments])

  const handleReviewStatus = useCallback(async (id: string, status: ReviewStatus) => {
    clearReadyUndo()
    const request = Symbol(id)
    reviewRequests.current.set(id, request)
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, reviewStatus: status, updatedAt: new Date().toISOString() } : c))
    try {
      await trackFeedbackWrite(apiUpdateReview(API_BASE, accessToken, id, status))
      posthog.capture('feedback_review_status_changed', { review_status: status })
      if (reviewRequests.current.get(id) === request) await refreshComments()
    } catch (err) {
      console.error('Failed to update review status:', err)
      if (reviewRequests.current.get(id) === request) mutation.report(err)
      if (reviewRequests.current.get(id) === request) await refreshComments()
    } finally {
      if (reviewRequests.current.get(id) === request) reviewRequests.current.delete(id)
    }
  }, [accessToken, refreshComments, mutation.report, clearReadyUndo, trackFeedbackWrite])

  const handleToggleDone = useCallback(async (id: string) => {
    clearReadyUndo()
    const current = comments.find((c) => c.id === id)
    if (!current) return
    const scope = feedbackWrites.current
    const nextStatus: ImplStatus = current.implementationStatus === 'done' ? 'unassigned' : 'done'
    setComments((prev) => prev.map((c) => c.id === id
      ? {
          ...c,
          implementationStatus: nextStatus,
          claimedByAgentId: nextStatus === 'unassigned' ? null : c.claimedByAgentId,
          updatedAt: new Date().toISOString(),
        }
      : c))
    try {
      const operation = trackFeedbackWrite(apiUpdateImpl(API_BASE, accessToken, id, nextStatus))
      const version = scope.version
      const updated = await operation
      if (nextStatus === 'done') posthog.capture('feedback_marked_done')
      if (feedbackWrites.current === scope && scope.version === version) {
        setComments((prev) => prev.map((c) => c.id === id ? {
          ...c,
          reviewStatus: updated.reviewStatus,
          implementationStatus: updated.implementationStatus,
          claimedByAgentId: updated.claimedByAgentId,
          visibility: updated.visibility,
          updatedAt: updated.updatedAt,
        } : c))
      } else {
        await reconcileFeedback(scope)
      }
    } catch (err) {
      console.error('Failed to update implementation status:', err)
      mutation.report(err)
      refreshComments()
    }
  }, [accessToken, comments, refreshComments, mutation.report, clearReadyUndo, trackFeedbackWrite, reconcileFeedback])

  const toggleReview = useCallback((c: Comment, target: 'accepted' | 'rejected') => {
    handleReviewStatus(c.id, c.reviewStatus === target ? 'open' : target)
  }, [handleReviewStatus])

  const handleVisibilityChange = useCallback(async (id: string, visibility: 'shared' | 'internal') => {
    const scope = feedbackWrites.current
    const previous = comments.find((comment) => comment.id === id)?.visibility
    setComments((current) => current.map((comment) => comment.id === id
      ? { ...comment, visibility }
      : comment))
    try {
      const operation = trackFeedbackWrite(apiUpdateVisibility(API_BASE, accessToken, id, visibility))
      const version = scope.version
      const updated = await operation
      if (feedbackWrites.current === scope && scope.version === version) {
        setComments((current) => current.map((comment) => comment.id === id
          ? {
              ...comment,
              reviewStatus: updated.reviewStatus,
              implementationStatus: updated.implementationStatus,
              claimedByAgentId: updated.claimedByAgentId,
              visibility: updated.visibility,
              updatedAt: updated.updatedAt,
            }
          : comment))
      } else {
        await reconcileFeedback(scope)
      }
    } catch (error) {
      if (previous) {
        setComments((current) => current.map((comment) => comment.id === id
          ? { ...comment, visibility: previous }
          : comment))
      }
      console.error('Failed to update feedback audience:', error)
      mutation.report(error)
    }
  }, [accessToken, comments, mutation.report, trackFeedbackWrite, reconcileFeedback])

  const toggleBulkSelect = useCallback((id: string, range: string[] = [id]) => {
    if (bulkActionBusy) return
    const next = new Set(bulkSelectedIds)
    for (const item of range) bulkSelectedIds.has(id) ? next.delete(item) : next.add(item)
    if (next.size > 500) {
      setBulkActionError('Select up to 500 comments at a time.')
      return
    }
    setBulkMode(true)
    setBulkActionError('')
    setBulkSelectedIds(next)
  }, [bulkActionBusy, bulkSelectedIds])

  const exitBulkMode = useCallback(() => {
    bulkGeneration.current++
    setBulkActionBusy(false)
    setPendingBulkSelection(null)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkTransitionNotice('')
    setBulkActionError('')
  }, [])

  const applyBulkAction = useCallback(async (action: 'ready' | 'done' | 'reject' | 'reopen') => {
    const ids = Array.from(bulkSelectedIds)
    const previous = comments.filter(c => bulkSelectedIds.has(c.id) && (action === 'reopen' || action === 'reject' || c.reviewStatus !== 'accepted' || (action === 'done' && c.implementationStatus !== 'done')))
    clearReadyUndo()
    const generation = bulkGeneration.current
    setBulkActionBusy(true)
    setBulkActionError('')
    const idSet = new Set(ids)
    const requests = new Map(ids.map((id) => {
      const request = Symbol(id)
      reviewRequests.current.set(id, request)
      return [id, request] as const
    }))

    setComments((prev) => prev.map((c) => {
      if (!idSet.has(c.id)) return c
      const ts = new Date().toISOString()
      if (action === 'reopen') return { ...c, reviewStatus: 'open' as ReviewStatus, implementationStatus: 'unassigned' as ImplStatus, claimedByAgentId: null, updatedAt: ts }
      if (action === 'ready') return { ...c, reviewStatus: 'accepted' as ReviewStatus, updatedAt: ts }
      if (action === 'done') return { ...c, reviewStatus: 'accepted' as ReviewStatus, implementationStatus: 'done' as ImplStatus, updatedAt: ts }
      return { ...c, reviewStatus: 'rejected' as ReviewStatus, updatedAt: ts }
    }))
    const calls = ids.map(async (id) => {
      if (action === 'ready') return trackFeedbackWrite(apiUpdateReview(API_BASE, accessToken, id, 'accepted'))
      if (action === 'done') return trackFeedbackWrite(apiUpdateReview(API_BASE, accessToken, id, 'accepted', comments.find(c => c.id === id)?.updatedAt, 'done'))
      return trackFeedbackWrite(apiUpdateReview(API_BASE, accessToken, id,
        action === 'reject' ? 'rejected' : 'open', comments.find(c => c.id === id)?.updatedAt,
        action === 'reopen' ? 'unassigned' : undefined, { captureUndo: true, preserveExternalWork: true }))

    })

    const results = await Promise.allSettled(calls)
    const failedIds = results.flatMap((result, index) => result.status === 'rejected' ? [ids[index]!] : [])
    const failed = results.filter((result) => result.status === 'rejected')
    const stillCurrent = generation === bulkGeneration.current && ids.some((id) => reviewRequests.current.get(id) === requests.get(id))
    if (failed.length > 0) {
      console.error(`Bulk ${action}: ${failed.length}/${calls.length} calls failed`, failed)
      if (stillCurrent) { mutation.report((failed[0] as PromiseRejectedResult).reason); await refreshComments() }
    } else if (stillCurrent) {
      await refreshComments()
    }
    for (const id of ids) {
      if (reviewRequests.current.get(id) === requests.get(id)) reviewRequests.current.delete(id)
    }
    if (stillCurrent && generation === bulkGeneration.current) {
      setReadyUndo(previous.flatMap<typeof readyUndo[number]>(c => {
        const result = results[ids.indexOf(c.id)]
        if (result.status !== 'fulfilled' || !result.value?.updatedAt) return []
        if (action === 'reject' || action === 'reopen') return result.value.undoToken ? [{ ...c, undoVersion: result.value.updatedAt, undoToken: result.value.undoToken, undoAction: action }] : []
        return [{ ...c, undoVersion: result.value.updatedAt, ...(action === 'done' ? { undoImplementation: c.implementationStatus } : {}) }]
      }))
      if (failedIds.length > 0) {
        setBulkMode(true)
        setBulkSelectedIds(action === 'ready' ? new Set(ids) : new Set(failedIds))
        setBulkActionError(`${failedIds.length} item${failedIds.length === 1 ? '' : 's'} could not be updated and remain selected.`)
      } else if (action !== 'ready') {
        exitBulkMode()
      }
    }
    if (generation === bulkGeneration.current) setBulkActionBusy(false)
  }, [accessToken, comments, bulkActionBusy, bulkSelectedIds, exitBulkMode, refreshComments, mutation.report, clearReadyUndo, trackFeedbackWrite])

  const undoReady = async () => {
    const generation = bulkGeneration.current
    const scope = feedbackWrites.current
    const request = Symbol('undo-ready')
    readyUndoRequest.current = request
    setBulkActionBusy(true)
    setBulkActionError('')
    const results = await Promise.allSettled(readyUndo.map(async (before) => {
      const current = comments.find(c => c.id === before.id)
      if (!before.undoToken && (!current || current.reviewStatus !== 'accepted' || current.implementationStatus !== (before.undoImplementation === undefined ? before.implementationStatus : 'done') || current.claimedByAgentId !== before.claimedByAgentId)) throw new Error('Feedback changed. Refresh and review it before undoing.')
      await trackFeedbackWrite(before.undoToken
        ? apiUpdateReview(API_BASE, accessToken, before.id, before.reviewStatus, undefined, undefined, { undoToken: before.undoToken })
        : apiUpdateReview(API_BASE, accessToken, before.id, before.reviewStatus, before.undoVersion, before.undoImplementation))
      if (generation === bulkGeneration.current && readyUndoRequest.current === request) setComments(prev => prev.map(c => c.id === before.id ? { ...c, reviewStatus: before.reviewStatus, implementationStatus: before.undoToken ? before.implementationStatus : before.undoImplementation ?? c.implementationStatus, claimedByAgentId: before.undoToken ? before.claimedByAgentId : c.claimedByAgentId } : c))
    }))
    if (generation !== bulkGeneration.current || readyUndoRequest.current !== request) {
      if (readyUndoRequest.current === request) clearReadyUndo()
      await reconcileFeedback(scope)
      return
    }
    readyUndoRequest.current = null
    for (const result of results) {
      if (result.status === 'rejected') mutation.report(result.reason)
    }
    const conflicts = new Set(results.flatMap((result, i) => result.status === 'rejected' && result.reason?.status === 409 ? [i] : []))
    const unavailable = new Set(results.flatMap((result, i) => result.status === 'rejected' && readyUndo[i].undoToken && result.reason?.status === 400 ? [i] : []))
    const remaining = readyUndo.filter((_, i) => results[i].status === 'rejected' && !conflicts.has(i) && !unavailable.has(i))
    setReadyUndo(remaining)
    setBulkActionBusy(false)
    if (unavailable.size) setBulkActionError('Undo expired or is no longer valid for some items. Refresh to review them.')
    else if (conflicts.size) setBulkActionError('Feedback changed after this action and was not undone. Refresh to review it.')
    else if (remaining.length) setBulkActionError('Some items could not be restored. Undo retries only those items.')
    else setBulkTransitionNotice('Previous statuses restored.')
    await refreshComments()
  }

  const openAgentUpgrade = useCallback(async () => {
    const generation = bulkGeneration.current
    setBulkActionError('')
    try {
      const checkout = await beginBillingCheckout(API_BASE, accessToken)
      if (generation !== bulkGeneration.current) return
      window.location.assign(checkout.url)
    } catch (error) {
      if (generation !== bulkGeneration.current) return
      setBulkActionError(error instanceof Error ? error.message : 'Could not open plan upgrade.')
    }
  }, [accessToken])

  const handoffSelectedToAgent = useCallback(async () => {
    const commentIds = [...bulkSelectedIds]
    if (commentIds.length > 500) {
      setBulkActionError('Select up to 500 comments at a time.')
      return
    }
    if (commentsProjectId !== selectedProject || selectedBulkComments.length !== commentIds.length) {
      setBulkActionError('Feedback changed. Review the selection and retry.')
      return
    }
    if (!allSelectedReady) {
      await applyBulkAction('ready')
      return
    }
    if (selectedBulkComments.some((comment) => comment.visibility !== 'shared')) {
      setBulkActionError('Only shared feedback can be sent to Agent. Update the audience or remove internal items from the selection.')
      return
    }
    const generation = bulkGeneration.current
    clearReadyUndo()
    setBulkActionBusy(true)
    setBulkActionError('')
    try {
      const share = await createShare(API_BASE, accessToken, {
        projectId: selectedProject,
        scopeType: 'selection',
        commentIds,
      })
      if (generation !== bulkGeneration.current) return
      if (share.commentCount !== commentIds.length) throw new Error('Feedback changed. Review the selection and retry.')
      const result = await getPrompt(API_BASE, accessToken, share.shareId, selectedAgentMeta.target)
      if (generation !== bulkGeneration.current) return
      await navigator.clipboard.writeText(result.prompt)
      if (generation !== bulkGeneration.current) return
      adoptSession({ shareId: share.shareId, slug: share.slug, token: share.token, docUrl: share.tokenUrl }, commentIds)
      setView('agent-runs')
      setBulkTransitionNotice(`${commentIds.length} selected item${commentIds.length === 1 ? '' : 's'} copied for ${selectedAgentMeta.name}.`)
    } catch (error) {
      if (generation !== bulkGeneration.current) return
      const requestError = error as Error & { code?: string }
      if (requestError.code === 'upgrade_required') {
        await openAgentUpgrade()
      } else {
        setBulkActionError(requestError.message || 'Could not send the selected feedback to Agent.')
      }
    } finally {
      if (generation === bulkGeneration.current) setBulkActionBusy(false)
    }
  }, [accessToken, allSelectedReady, applyBulkAction, bulkActionBusy, openAgentUpgrade, selectedAgentMeta, selectedBulkComments, bulkSelectedIds, commentsProjectId, selectedProject, adoptSession, clearReadyUndo])

  const toggleSelectAllVisible = useCallback(() => {
    if (bulkActionBusy) return
    setBulkActionError('')
    const visibleIds = filteredComments.map((c) => c.id)
    if (visibleIds.length > 500) {
      setBulkActionError('Select up to 500 comments at a time. Narrow the list or select comments individually.')
      return
    }
    setBulkMode(true)
    setBulkSelectedIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(visibleIds)
    })
  }, [bulkActionBusy, filteredComments])

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
      if (view === 'extension-comments' || view === 'recordings' || view === 'brain') return
      // ⌘K must run before the input-focus / palette-open guards below — it's the global escape hatch.
      if (shortcutsEnabled && (e.metaKey || e.ctrlKey) && e.key === 'k') {
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

      if (!shortcutsEnabled) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (cmdOpen) return

      // Comment shortcuts act on the selected comment, so only while the feedback list shows it.
      if (view === 'feedback') {
        if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); goNext() }
        if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
        if (e.key === ' ') { e.preventDefault(); goNext() }

        if (selectedComment && canManageFeedback) {
          if (e.key === 'a') toggleReview(selectedComment, 'accepted')
          if (e.key === 'd') toggleReview(selectedComment, 'rejected')
          if (e.key === 'm') handleToggleDone(selectedComment.id)
        }
      }

      if (e.key === 's' && canOpenAgentPanel && (view === 'feedback' || agentView !== null)) setView((v) => v === 'next-steps' ? 'feedback' : 'next-steps')
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsEnabled, goNext, goPrev, selectedComment, toggleReview, handleToggleDone, cmdOpen, bulkMode, exitBulkMode, view, agentView, canManageFeedback, canOpenAgentPanel])

  const handleCmdSelect = useCallback((commentId: string) => {
    setView('feedback')
    setSelectedCommentId(commentId)
    setCmdOpen(false)
  }, [])

  const selectFilter = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter)
    setSelectedCommentId('')
  }, [])

  const handleCmdAction = useCallback((action: string) => {
    if (action === 'toggle-sidebar' && canOpenAgentPanel) setView((v) => v === 'next-steps' ? 'feedback' : 'next-steps')
    if (action === 'filter-all') selectFilter('all')
    if (action === 'filter-open') selectFilter('open')
    if (action === 'filter-ready') selectFilter('ready')
    if (action === 'filter-ready-for-testing') selectFilter('ready_for_testing')
    if (action === 'filter-done') selectFilter('done')
    // A filter or comment picked from another page is shown in the feedback list.
    if (action.startsWith('filter-')) setView('feedback')
    // Like A, D and M: act on the selected comment only while the feedback list shows it.
    if (view === 'feedback' && selectedComment && canManageFeedback) {
      if (action === 'accept') toggleReview(selectedComment, 'accepted')
      if (action === 'reject') toggleReview(selectedComment, 'rejected')
      if (action === 'done') handleToggleDone(selectedComment.id)
    }
    setCmdOpen(false)
  }, [view, selectedComment, toggleReview, handleToggleDone, selectFilter, canManageFeedback, canOpenAgentPanel])

  const handleCopySessionLink = useCallback(async () => {
    if (!agentSession) return
    setCopyStatus('copying')
    try {
      await copyPrompt(selectedAgentMeta.target)
      posthog.capture('agent_handoff_copied', { agent: selectedAgentMeta.id })
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    } catch (err) {
      console.error('Copy prompt failed:', err)
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    }
  }, [agentSession, copyPrompt, selectedAgentMeta])

  // Selecting a project always returns to the feedback view; settings is a
  // per-project overlay that shouldn't persist across project switches.
  const selectProject = useCallback((key: string) => {
    exitBulkMode()
    setPendingBulkSelection(null)
    setBulkTransitionNotice('')
    setSelectedProject(key)
    setView('feedback')
  }, [exitBulkMode])

  const openExtensionComments = useCallback(() => {
    setView('extension-comments')
    setSelectedProject('')
    setSelectedCommentId('')
    setPendingCommentSelection(null)
    setPendingBulkSelection(null)
    setBulkTransitionNotice('')
    setCmdOpen(false)
    exitBulkMode()
  }, [exitBulkMode])

  const openWorkspacePage = useCallback((page: 'recordings' | 'brain') => {
    setView(page)
    setSelectedCommentId('')
    setPendingCommentSelection(null)
    setPendingBulkSelection(null)
    setBulkTransitionNotice('')
    setCmdOpen(false)
    exitBulkMode()
  }, [exitBulkMode])

  const continueMovedInboxSelection = useCallback((projectKey: string, commentIds: string[], skippedCount: number, undoItems?: InboxUndoItem[]) => {
    setSelectedProject(projectKey)
    setView('feedback')
    setStatusFilter('open')
    setSelectedCommentId('')
    setInboxUndo(undoItems?.length ? {actor:user.id,projectId:projectKey,items:undoItems} : null)
    setPendingBulkSelection({ projectKey, commentIds })
    setBulkSelectedIds(new Set(commentIds))
    setBulkMode(true)
    setBulkTransitionNotice(`${commentIds.length} Inbox item${commentIds.length === 1 ? '' : 's'} moved${skippedCount ? `; ${skippedCount} skipped` : ''}.`)
  }, [user.id])

  // The New project page stays open after creating, so it can show the first pin arriving.
  const handleAddProject = useCallback(async (projectKey: string, name: string) => {
    setAddProjectError(null)
    try {
      const project = await claimProject(projectKey, name)
      posthog.capture('project_created')
      setSelectedProject(project.publicKey)
      setView('feedback')
      setStatusFilter('open')
      setSelectedCommentId('')
      setAddProjectOpen(true)
      return true
    } catch (err) {
      setAddProjectError(err instanceof Error ? err.message : 'Failed to create project')
      return false
    }
  }, [claimProject])

  const handleOpenCommentActivity = useCallback((payload: { projectKey: string; latestCommentId?: string }) => {
    // Opening a comment from the bell leaves the New project page, like the sidebar does.
    setAddProjectOpen(false)
    setSelectedProject(payload.projectKey)
    setView('feedback')
    setStatusFilter('open')
    if (payload.latestCommentId) {
      setPendingCommentSelection({ projectKey: payload.projectKey, commentId: payload.latestCommentId })
      void refreshComments()
    } else {
      setSelectedCommentId('')
    }
  }, [refreshComments])

  const checkFirstPin = useCallback(() => { void refreshComments() }, [refreshComments])
  // Opens a comment from Next steps or Agent runs in the project's feedback list.
  const openComment = useCallback((commentId: string) => {
    setView('feedback')
    setStatusFilter('all')
    setSelectedCommentId(commentId)
  }, [])

  // An account without projects lands on the New project page instead of an empty project.
  const noProjects = !projectsLoading && !projectsError && projects.length === 0
  const newProjectOpen = view === 'feedback' && (addProjectOpen || noProjects)

  return (
    <DashboardShell
        agentAction={canOpenAgentPanel
          ? <AgentLauncher readyCount={readyAgentCommentIds.length} open={agentView === 'next-steps'} onOpen={() => setView('next-steps')} />
          : <AgentLauncher readyCount={readyAgentCommentIds.length} open={false} disabled unavailableReason={agentUnavailableReason} />}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        commentsLoading={commentsLoading}
        selectedProject={selectedProject}
        commentCount={comments.length}
        setSelectedProject={selectProject}
        setStatusFilter={setStatusFilter}
        setSelectedCommentId={setSelectedCommentId}
        newProjectActive={newProjectOpen}
        onNewProject={openNewProject}
        onLeaveNewProject={() => setAddProjectOpen(false)}
        onOpenCmd={() => setCmdOpen(true)}
        onOpenSettings={() => { setConnectStorybook(false); setView('settings') }}
        agentNav={canOpenAgentPanel ? {
          readyCount: readyAgentCommentIds.length,
          live: agentConnected,
          active: agentView,
          onOpenNextSteps: () => setView('next-steps'),
          onOpenAgentRuns: () => setView('agent-runs'),
        } : undefined}
        canManageProject={canManageProject}
        settingsActive={view === 'settings'}
        onOpenExtensionComments={openExtensionComments}
        extensionCommentsActive={view === 'extension-comments'}
        onOpenRecordings={() => openWorkspacePage('recordings')}
        onOpenBrain={() => openWorkspacePage('brain')}
        brainActive={view === 'brain'}
        recordingsActive={view === 'recordings' || view === 'recording'}
        apiBase={API_BASE}
        accessToken={accessToken}
        onProjectsChanged={refreshProjects}
        onOpenCommentActivity={handleOpenCommentActivity}
        theme={theme}
        toggleTheme={() => setTheme((t) => t === 'light' ? 'dark' : 'light')}
        user={user}
        onSignOut={onSignOut}
        superadmin={superadmin}
        superAdminActive={view === 'super-admin'}
        onOpenSuperAdmin={() => setView('super-admin')}
        footer={<StatusBar personal={view === 'extension-comments' || newProjectOpen} agentAvailable={canOpenAgentPanel} />}
      >
      <TrialOffer apiBase={API_BASE} accessToken={accessToken} userId={user.id} />
      {accessReviewNotice}
      {mutation.error && <p role="alert" className="border-b border-border bg-card p-4 text-sm">{mutation.error}</p>}
      {newProjectOpen ? (
        <NewProjectPage
          key={newProjectRun}
          apiBase={API_BASE}
          first={noProjects}
          checkAvailability={checkAvailability}
          onCreate={handleAddProject}
          error={addProjectError}
          planRequired={projectGate.planRequired ? { label: projectGate.trialAvailable ? 'Start free trial' : 'Subscribe to Pro', trial: projectGate.trialAvailable } : undefined}
          firstPin={commentsProjectId === selectedProject && serverComments.length > 0}
          onOpenProject={() => setAddProjectOpen(false)}
          onCheckFirstPin={checkFirstPin}
          suggestedProjects={<SuggestedProjects apiBase={API_BASE} accessToken={accessToken} onProjectsChanged={refreshProjects} />}
        />
      ) : view === 'recording' ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><RecordingSharePage apiBase={API_BASE} ownerToken={accessToken} /></div>
      ) : view === 'extension-comments' ? (
        <ExtensionCommentsPage apiBase={API_BASE} accessToken={accessToken} projects={projects} onMovedToProject={continueMovedInboxSelection} />
      ) : view === 'recordings' ? (
        <RecordingsPage apiBase={API_BASE} accessToken={accessToken} />
      ) : view === 'brain' ? (
        <BrainPage />
      ) : agentView === 'next-steps' ? (
        <NextStepsPage
          projectName={activeProject!.name}
          comments={readyAgentComments}
          handoff={{ sessionReady: agentSession !== null, selectedAgent, setSelectedAgent, selectedAgentMeta, agentDropdownOpen, setAgentDropdownOpen, copyStatus, onCopySessionLink: handleCopySessionLink }}
          agentError={agentError}
          agentErrorCode={agentErrorCode}
          agentConnected={agentConnected}
          onUpgrade={openAgentUpgrade}
          onRetry={retryAgentSession}
          onOpenComment={openComment}
          onOpenRuns={() => setView('agent-runs')}
          direct={directDelivery}
        />
      ) : agentView === 'agent-runs' ? (
        <AgentRunsPage
          projectName={activeProject!.name}
          agentName={selectedAgentMeta.name}
          connected={agentConnected}
          queue={agentQueueComments}
          events={agentEvents}
          agentError={agentError}
          agentErrorCode={agentErrorCode}
          notice={bulkTransitionNotice}
          selectedCommentId={selectedCommentId}
          onUpgrade={openAgentUpgrade}
          onRetry={retryAgentSession}
          onOpenComment={openComment}
          onOpenNextSteps={() => setView('next-steps')}
        />
      ) : view === 'super-admin' && superadmin ? (
        <SuperAdminPanel apiBase={API_BASE} accessToken={accessToken} />
      ) : view === 'settings' && activeProject ? (
        <ProjectSettings
          key={activeProject.publicKey}
          project={activeProject}
          apiBase={API_BASE}
          accessToken={accessToken}
          currentUserId={user.id}
          onBack={() => { setConnectStorybook(false); setView('feedback') }}
          onProjectsChanged={refreshProjects}
          connectStorybook={connectStorybook}
        />
      ) : (
      <>
        <div className="flex shrink-0 flex-col gap-2">
        {(bulkActionError || bulkTransitionNotice) && <div role={bulkActionError ? 'alert' : 'status'} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">{bulkActionError || bulkTransitionNotice}</div>}
        {inboxUndo && inboxUndo.actor === user.id && inboxUndo.projectId === selectedProject && canManageFeedback && <InboxMoveUndo key={`${user.id}:${inboxUndo.items[0].updatedAt}`} apiBase={API_BASE} accessToken={accessToken} projectId={inboxUndo.projectId} items={inboxUndo.items} onProgress={()=>{void reconcileFeedback(feedbackWrites.current);void refreshProjects()}} onRestored={()=>{setInboxUndo(null);openExtensionComments()}} />}
        {readyUndo.length > 0 && canManageFeedback && <div role="status" className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
          <span>{readyUndo.length} {readyUndo[0].undoAction === 'reject' ? 'rejected. Linked issues unchanged' : readyUndo[0].undoAction === 'reopen' ? 'reopened' : `marked ${readyUndo[0].undoImplementation === undefined ? 'ready' : 'done'}`}.</span>
          <button type="button" className="dashboard-bulk-secondary" disabled={bulkActionBusy} onClick={() => { void undoReady() }}>Undo {readyUndo[0].undoAction ?? `mark ${readyUndo[0].undoImplementation === undefined ? 'ready' : 'done'}`}</button>
        </div>}
        </div>
      <div className="dashboard-feedback">
        <CommentList
          readOnly={!canManageFeedback}
          filteredComments={filteredComments}
          counts={counts}
          statusFilter={statusFilter}
          selectFilter={selectFilter}
          bulkMode={bulkMode}
          enterBulkMode={() => setBulkMode(true)}
          exitBulkMode={exitBulkMode}
          bulkSelectedIds={bulkSelectedIds}
          toggleSelectAllVisible={toggleSelectAllVisible}
          toggleBulkSelect={toggleBulkSelect}
          commentsLoading={commentsLoading}
          commentsError={commentsError}
          selectedCommentId={selectedCommentId}
          setSelectedCommentId={setSelectedCommentId}
        />

        <CommentDetail
          readOnly={!canManageFeedback}
          onConnectStorybook={activeProject?.role === 'owner' ? openStorybookSetup : undefined}
          storybookConnected={storybookConnected === true}
          onOpenIntegrations={canManageProject ? () => { setConnectStorybook(false); setView('settings') } : undefined}
          selectedComment={selectedComment}
          selectedProject={selectedProject}
          commentsLoading={commentsLoading}
          commentsError={commentsError}
          projectComments={projectComments}
          filteredComments={filteredComments}
          selectedIdx={selectedIdx}
          goPrev={goPrev}
          goNext={goNext}
          toggleReview={toggleReview}
          handleToggleDone={handleToggleDone}
          onVisibilityChange={handleVisibilityChange}
          onScreenshotRetry={refreshCommentsInBackground}
          apiBase={API_BASE}
          accessToken={accessToken}
        />


        {bulkMode && canManageFeedback && (
          <BulkActionBar selectedCount={bulkSelectedIds.size} busy={bulkActionBusy} onClose={exitBulkMode}>
            {!allSelectedReady && (
              <span className="dashboard-bulk-readiness" aria-live="polite">
                {selectedReadyCount} of {selectedBulkComments.length} ready
              </span>
            )}
            <button
              type="button"
              className="dashboard-bulk-primary"
              disabled={bulkActionBusy}
              onClick={() => { void handoffSelectedToAgent() }}
            >
              {bulkActionBusy ? 'Working…' : allSelectedReady ? `Send to ${selectedAgentMeta.name}` : 'Mark ready'}
            </button>
            <button type="button" className="dashboard-bulk-secondary" disabled={bulkActionBusy} onClick={() => { void applyBulkAction('done') }}>Mark done</button>
            <button type="button" className="dashboard-bulk-secondary" disabled={bulkActionBusy} onClick={() => { void applyBulkAction('reopen') }}>Reopen</button>
            <button type="button" className="dashboard-bulk-secondary dashboard-bulk-danger" disabled={bulkActionBusy} title="Reject feedback only; linked issues stay unchanged" onClick={() => { void applyBulkAction('reject') }}>Reject</button>
            <span className="text-xs text-muted-foreground">Reject keeps linked issues unchanged.</span>
          </BulkActionBar>
        )}
      </div>
      </>
      )}

      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          comments={projectComments}
          onSelect={handleCmdSelect}
          onAction={handleCmdAction}
          selectedCommentId={selectedCommentId}
          canManageFeedback={canManageFeedback}
          canOperateAgent={canOpenAgentPanel}
        />
      )}
    </DashboardShell>
  )
}
