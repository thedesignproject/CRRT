import { getServiceSupabase } from './supabase.js'
import {
  AdminQueryError,
  decodeAdminCursor,
  encodeAdminCursor,
  type AdminPage,
} from './admin-pagination.js'
import { fromLegacyStatus, toLegacyStatus, type ImplementationStatus, type ReviewStatus } from './status.js'

// Every table/storage operation in this module goes through the service-role
// client. Every public table has RLS enabled with no permissive policy
// (migration 0004), so the anon key — which ships in the dashboard bundle —
// can't reach them directly. The service-role client bypasses RLS; each
// function below enforces its own scoping (project membership, user_id, project
// key) and callers gate access via `requireUser` / `requireProjectMembership`
// in `api/`.
const getSupabase = getServiceSupabase

type CommentRow = {
  id: string
  project_id: string
  url: string
  x: number
  y: number
  element: string
  comment: string
  status: string | null
  implementation_status: ImplementationStatus | null
  claimed_by_agent_id: string | null
  image_url: string | null
  author_name: string | null
  target_type: string | null
  anchor: Record<string, unknown> | null
  github_issue_number?: number | null
  github_issue_url?: string | null
  github_issue_created_at?: string | null
  github_issue_lease_token?: string | null
  github_issue_lease_expires_at?: string | null
  github_issue_uncertain_at?: string | null
  created_at: string
  updated_at: string | null
}

// Single source of truth for comment selects — an omission here (or a
// hand-rolled select list elsewhere) silently drops fields from responses.
const COMMENT_COLUMNS =
  'id, project_id, url, x, y, element, comment, status, implementation_status, claimed_by_agent_id, image_url, author_name, target_type, anchor, created_at, updated_at'
const COMMENT_GITHUB_ISSUE_COLUMNS =
  `${COMMENT_COLUMNS}, github_issue_number, github_issue_url, github_issue_created_at, github_issue_lease_token, github_issue_lease_expires_at, github_issue_uncertain_at`

type ProjectRow = {
  public_key: string
  slug: string
  name: string
  allowed_origins: string[] | null
  created_at: string
  updated_at: string
}

const PROJECT_COLUMNS = 'public_key, slug, name, allowed_origins, created_at, updated_at'

type ProjectMemberRow = {
  project_key: string
  user_id: string
  role: 'admin' | 'member'
}

type RepoConfigRow = {
  project_key: string
  repo_url: string | null
  github_owner: string | null
  github_repo: string | null
  github_installation_id: string | null
  local_path: string | null
  default_branch: string | null
  install_command: string | null
  dev_command: string | null
  test_command: string | null
  build_command: string | null
  agent_instructions: string | null
}

type GitHubUserInstallationRow = {
  id: string
  user_id: string
  installation_id: string
  github_account_id: string
  github_account_login: string
  github_account_type: 'User' | 'Organization'
  last_verified_at: string
}

const REPO_CONFIG_COLUMNS =
  'project_key, repo_url, github_owner, github_repo, github_installation_id, local_path, default_branch, install_command, dev_command, test_command, build_command, agent_instructions'

const GITHUB_USER_INSTALLATION_COLUMNS =
  'id, user_id, installation_id, github_account_id, github_account_login, github_account_type, last_verified_at'

function mapGitHubUserInstallation(row: GitHubUserInstallationRow) {
  return {
    id: row.id,
    installationId: row.installation_id,
    githubAccountId: row.github_account_id,
    githubAccountLogin: row.github_account_login,
    githubAccountType: row.github_account_type,
    lastVerifiedAt: row.last_verified_at,
  }
}

function publicGitHubUserInstallation(row: GitHubUserInstallationRow) {
  const mapped = mapGitHubUserInstallation(row)
  return {
    id: mapped.id,
    githubAccountLogin: mapped.githubAccountLogin,
    githubAccountType: mapped.githubAccountType,
    lastVerifiedAt: mapped.lastVerifiedAt,
  }
}

type ShareRow = {
  id: string
  project_id: string
  scope_type: 'page' | 'selection'
  scope_page_url: string | null
  slug: string
  access_token_hash: string
  access_token_ciphertext: string
  created_by: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}

type PresenceRow = {
  share_id: string
  agent_id: string
  status: string
  summary: string | null
  last_seen_at: string
}

type EventRow = {
  id: number
  share_id: string
  comment_id: string | null
  actor_type: string
  actor_id: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

function mapComment(row: CommentRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    pageUrl: row.url,
    selector: row.element,
    x: row.x,
    y: row.y,
    body: row.comment,
    reviewStatus: fromLegacyStatus(row.status),
    implementationStatus: row.implementation_status || 'unassigned',
    claimedByAgentId: row.claimed_by_agent_id,
    imageUrl: row.image_url || null,
    authorName: row.author_name || null,
    targetType: row.target_type === 'text_range' ? ('text_range' as const) : ('element_point' as const),
    anchor: row.anchor ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

function mapProjectComment(row: CommentRow) {
  return {
    ...mapComment(row),
    githubIssue: row.github_issue_number && row.github_issue_url && row.github_issue_created_at
      ? {
          issueNumber: row.github_issue_number,
          issueUrl: row.github_issue_url,
          createdAt: row.github_issue_created_at,
        }
      : null,
  }
}

function mapProject(row: ProjectRow) {
  return {
    publicKey: row.public_key,
    slug: row.slug,
    name: row.name,
    allowedOrigins: row.allowed_origins ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRepoConfig(row: RepoConfigRow | null) {
  if (!row) return null
  const githubConnectionStatus = !row.repo_url
    ? 'disconnected'
    : row.github_installation_id
      ? 'connected'
      : 'reconnect_required'
  return {
    projectKey: row.project_key,
    repoUrl: row.repo_url,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    githubConnectionStatus,
    localPath: row.local_path,
    defaultBranch: row.default_branch,
    installCommand: row.install_command,
    devCommand: row.dev_command,
    testCommand: row.test_command,
    buildCommand: row.build_command,
    agentInstructions: row.agent_instructions,
  }
}

function mapShare(row: ShareRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeType: row.scope_type,
    scopePageUrl: row.scope_page_url,
    slug: row.slug,
    accessTokenHash: row.access_token_hash,
    accessTokenCiphertext: row.access_token_ciphertext,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }
}

function mapPresence(row: PresenceRow) {
  return {
    shareId: row.share_id,
    agentId: row.agent_id,
    status: row.status,
    summary: row.summary,
    lastSeenAt: row.last_seen_at,
  }
}

function mapEvent(row: EventRow) {
  return {
    id: row.id,
    shareId: row.share_id,
    commentId: row.comment_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    eventType: row.event_type,
    payload: row.payload || {},
    createdAt: row.created_at,
  }
}

export async function listProjectsForUser(userId: string) {
  const supabase = getSupabase()
  const { data: memberRows, error: memberError } = await supabase
    .from('project_members')
    .select('project_key')
    .eq('user_id', userId)

  if (memberError) throw new Error(memberError.message)
  const keys = (memberRows || []).map((row) => String((row as { project_key: string }).project_key))
  if (keys.length === 0) return []

  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .in('public_key', keys)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapProject(row as ProjectRow))
}

export async function getProjectMember(
  userId: string,
  projectKey: string,
): Promise<{ role: 'admin' | 'member' } | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_members')
    .select('project_key, user_id, role')
    .eq('user_id', userId)
    .eq('project_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return { role: (data as ProjectMemberRow).role }
}

export async function isProjectMember(userId: string, projectKey: string): Promise<boolean> {
  return (await getProjectMember(userId, projectKey)) !== null
}

type ProjectMemberDetailRow = {
  user_id: string
  role: 'admin' | 'member'
  created_at: string
}

/**
 * List a project's members with their emails resolved. The membership table
 * only stores user ids; emails come from the auth admin API (see
 * `getUserEmailsByIds`), and degrade to null when the service key is absent.
 */
export async function listProjectMembers(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role, created_at')
    .eq('project_key', projectKey)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  const rows = (data || []) as ProjectMemberDetailRow[]
  const emails = await getUserEmailsByIds(rows.map((r) => r.user_id))
  return rows.map((r) => ({
    userId: r.user_id,
    email: emails[r.user_id] ?? null,
    role: r.role,
    createdAt: r.created_at,
  }))
}

export async function listProjectMemberIds(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_key', projectKey)

  if (error) throw new Error(error.message)
  return ((data || []) as Array<{ user_id: string }>).map((row) => row.user_id)
}

/**
 * Remove a member from a project. Refuses to remove the last remaining admin
 * (`last_admin`) so a project can never be orphaned. Returns false when the
 * member wasn't in the project so callers can map that to a 404.
 *
 * The count + delete run inside the `remove_project_member` DB function (see
 * migration 0003) which locks the project's admin rows before counting — doing
 * it here in two queries would race, letting concurrent admin removals both pass
 * the guard and orphan the project.
 */
export async function removeProjectMember(projectKey: string, userId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('remove_project_member', {
    p_project_key: projectKey,
    p_user_id: userId,
  })

  if (error) throw new Error(error.message)
  if (data === 'last_admin') throw new Error('last_admin')
  return data === 'removed'
}

/**
 * Resolve auth.users ids to emails via the service-role admin API. Mirrors
 * `findUserIdByEmail`'s graceful fallback: returns an empty map (all emails
 * null at the call site) when the service key / URL is missing or a lookup
 * fails, rather than throwing.
 */
export async function getUserEmailsByIds(ids: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {}
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) return result
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.SUPABASE_URL
  if (!serviceKey || !url) return result

  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        })
        if (!res.ok) return
        const body = (await res.json()) as { email?: string }
        if (body.email) result[id] = body.email
      } catch {
        /* leave unresolved; surfaces as null email */
      }
    }),
  )
  return result
}

export type AdminUser = {
  id: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  projectsAsAdminCount: number
  projectsAsMemberCount: number
  superAdmin: boolean
}

/**
 * Super-admin view: every auth user, newest first, with how many projects each
 * belongs to. Users come from the auth admin API (paged); project counts come
 * from the `admin_user_project_counts` RPC (migration 0007), which aggregates
 * `project_members` in the DB so a large membership table can't be truncated by
 * PostgREST's row cap and miscount.
 */
type AdminUserCursor = { kind: 'users'; page: number; limit: number; lastId: string }

function parseAdminUserCursor(cursor: string | undefined, limit: number): AdminUserCursor {
  if (!cursor) return { kind: 'users', page: 1, limit, lastId: '' }
  const value = decodeAdminCursor(cursor) as Partial<AdminUserCursor> | null
  if (
    !value || value.kind !== 'users' || !Number.isInteger(value.page) || Number(value.page) < 2
    || value.limit !== limit || typeof value.lastId !== 'string' || !value.lastId
  ) throw new AdminQueryError('Invalid cursor')
  return value as AdminUserCursor
}

export async function listAllUsers(options: {
  limit: number
  cursor?: string
}): Promise<AdminPage<AdminUser>> {
  const supabase = getSupabase()
  const position = parseAdminUserCursor(options.cursor, options.limit)
  const { data, error } = await supabase.auth.admin.listUsers({
    page: position.page,
    perPage: options.limit,
  })
  if (error) throw new Error(error.message)
  const users = data?.users ?? []
  const ids = users.map((user) => user.id)
  let metricRows: unknown[] = []
  if (ids.length > 0) {
    const { data: metrics, error: metricsError } = await supabase
      .from('admin_user_metrics')
      .select('user_id, admin_project_count, member_project_count, super_admin')
      .in('user_id', ids)
    if (metricsError) throw new Error(metricsError.message)
    metricRows = metrics ?? []
  }
  type MetricRow = {
    user_id: string
    admin_project_count: number
    member_project_count: number
    super_admin: boolean
  }
  const metricsByUser = new Map(
    (metricRows as MetricRow[]).map((row) => [row.user_id, row]),
  )
  const items = users.map((u) => {
    const metrics = metricsByUser.get(u.id)
    return {
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmedAt: u.email_confirmed_at ?? null,
      projectsAsAdminCount: Number(metrics?.admin_project_count ?? 0),
      projectsAsMemberCount: Number(metrics?.member_project_count ?? 0),
      superAdmin: metrics?.super_admin ?? false,
    }
  })
  const nextPage = typeof data?.nextPage === 'number' ? data.nextPage : null
  const hasMore = nextPage !== null && items.length > 0
  return {
    items,
    hasMore,
    nextCursor: hasMore
      ? encodeAdminCursor({
          kind: 'users', page: nextPage, limit: options.limit, lastId: items[items.length - 1].id,
        })
      : null,
  }
}

export type AdminProjectMember = {
  email: string
  role: 'admin' | 'member'
}

export type AdminProject = {
  publicKey: string
  name: string
  createdAt: string
  commentCount: number
  commentStatusCounts: { pending: number; accepted: number; rejected: number }
  implementationStatusCounts: {
    unassigned: number; claimed: number; inProgress: number; blocked: number; done: number
  }
  feedbackShareCount: number
  commentedUrlCount: number
  firstCommentAt: string
  lastCommentAt: string
  claimed: boolean
  members: AdminProjectMember[]
}

export const ADMIN_PROJECT_SORTS = [
  'lastCommentAt', 'createdAt', 'commentCount', 'feedbackShareCount', 'commentedUrlCount',
] as const
export type AdminProjectSort = typeof ADMIN_PROJECT_SORTS[number]
export type AdminSortDirection = 'asc' | 'desc'

type AdminProjectCursor = {
  kind: 'projects'
  sort: AdminProjectSort
  direction: AdminSortDirection
  value: string | number
  id: string
}

const PROJECT_SORT_COLUMNS: Record<AdminProjectSort, string> = {
  lastCommentAt: 'last_comment_at',
  createdAt: 'created_at',
  commentCount: 'comment_count',
  feedbackShareCount: 'feedback_share_count',
  commentedUrlCount: 'commented_url_count',
}

/**
 * Super-admin view: every project that has received at least one comment,
 * ordered by most-recent comment, capped at `ADMIN_PROJECT_LIMIT`. Per project:
 * comment count, latest comment time, whether it's been claimed
 * (`claimable === false`), and every member with their role + resolved email
 * (admins are the owners; this also lets the dashboard scope projects to any
 * member).
 *
 * Comment count + latest-per-project are aggregated by the
 * `admin_projects_with_comments` RPC (migration 0007) rather than scanning the
 * whole `comments` table in Node, so a large table can't be truncated by
 * PostgREST's row cap and yield wrong counts / a partial project set.
 */
export async function listProjectsWithComments(options: {
  limit: number
  cursor?: string
  sort: AdminProjectSort
  direction: AdminSortDirection
}): Promise<AdminPage<AdminProject>> {
  const supabase = getSupabase()

  type AdminProjectRow = {
    public_key: string
    name: string
    claimable: boolean
    created_at: string
    comment_count: number
    pending_comment_count: number
    accepted_comment_count: number
    rejected_comment_count: number
    unassigned_comment_count: number
    claimed_comment_count: number
    in_progress_comment_count: number
    blocked_comment_count: number
    done_comment_count: number
    feedback_share_count: number
    commented_url_count: number
    first_comment_at: string
    last_comment_at: string
  }
  const column = PROJECT_SORT_COLUMNS[options.sort]
  let cursor: AdminProjectCursor | undefined
  if (options.cursor) {
    const value = decodeAdminCursor(options.cursor) as Partial<AdminProjectCursor> | null
    if (
      !value || value.kind !== 'projects' || value.sort !== options.sort
      || value.direction !== options.direction || !['string', 'number'].includes(typeof value.value)
      || typeof value.id !== 'string' || !value.id
    ) throw new AdminQueryError('Invalid cursor')
    cursor = value as AdminProjectCursor
  }
  let query = supabase
    .from('admin_project_metrics')
    .select('public_key, name, claimable, created_at, comment_count, pending_comment_count, accepted_comment_count, rejected_comment_count, unassigned_comment_count, claimed_comment_count, in_progress_comment_count, blocked_comment_count, done_comment_count, feedback_share_count, commented_url_count, first_comment_at, last_comment_at')
  if (cursor) {
    const operator = options.direction === 'asc' ? 'gt' : 'lt'
    query = query.or(
      `${column}.${operator}.${cursor.value},and(${column}.eq.${cursor.value},public_key.${operator}.${cursor.id})`,
    )
  }
  const { data: projectRows, error: projectError } = await query
    .order(column, { ascending: options.direction === 'asc' })
    .order('public_key', { ascending: options.direction === 'asc' })
    .limit(options.limit + 1)
  if (projectError) throw new Error(projectError.message)

  const projects = ((projectRows || []) as AdminProjectRow[]).slice(0, options.limit)
  const hasMore = (projectRows?.length ?? 0) > options.limit
  if (projects.length === 0) return { items: [], nextCursor: null, hasMore: false }
  const keys = projects.map((p) => p.public_key)

  const { data: memberRows, error: memberError } = await supabase
    .from('project_members')
    .select('project_key, user_id, role')
    .in('project_key', keys)
  if (memberError) throw new Error(memberError.message)

  type MemberRow = { project_key: string; user_id: string; role: 'admin' | 'member' }
  const rows = (memberRows || []) as MemberRow[]
  const membersByProject = new Map<string, MemberRow[]>()
  for (const row of rows) {
    const list = membersByProject.get(row.project_key) ?? []
    list.push(row)
    membersByProject.set(row.project_key, list)
  }
  const emails = await getUserEmailsByIds(rows.map((r) => r.user_id))

  const items = projects.map((row) => {
    const members = (membersByProject.get(row.public_key) ?? [])
      .map((m) => ({ email: emails[m.user_id], role: m.role }))
      .filter((m): m is AdminProjectMember => Boolean(m.email))
    return {
      publicKey: row.public_key,
      name: row.name,
      createdAt: row.created_at,
      commentCount: Number(row.comment_count),
      commentStatusCounts: {
        pending: Number(row.pending_comment_count),
        accepted: Number(row.accepted_comment_count),
        rejected: Number(row.rejected_comment_count),
      },
      implementationStatusCounts: {
        unassigned: Number(row.unassigned_comment_count),
        claimed: Number(row.claimed_comment_count),
        inProgress: Number(row.in_progress_comment_count),
        blocked: Number(row.blocked_comment_count),
        done: Number(row.done_comment_count),
      },
      feedbackShareCount: Number(row.feedback_share_count),
      commentedUrlCount: Number(row.commented_url_count),
      firstCommentAt: row.first_comment_at,
      lastCommentAt: row.last_comment_at,
      claimed: row.claimable === false,
      members,
    }
  })
  const last = items[items.length - 1]
  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeAdminCursor({
      kind: 'projects', sort: options.sort, direction: options.direction,
      value: last[options.sort], id: last.publicKey,
    }) : null,
  }
}

export type AdminStats = {
  accounts: number
  projects: number
  comments: number
  shares: number
  activeAgentPresence: number
  signups: { last24Hours: number; last7Days: number; last30Days: number }
}

export async function getAdminStats(now = new Date()): Promise<AdminStats> {
  const supabase = getSupabase()
  const countTable = async (table: string) => {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  const loadAuthStats = async () => {
    const createdTimes: number[] = []
    let page = 1
    let total: number | null = null
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw new Error(error.message)
      const users = data?.users ?? []
      if (typeof data?.total === 'number') total = data.total
      createdTimes.push(...users.map((user) => Date.parse(user.created_at)))
      if (typeof data?.nextPage !== 'number') break
      page = data.nextPage
    }
    const since = (days: number) => now.getTime() - days * 24 * 60 * 60 * 1000
    return {
      accounts: total ?? createdTimes.length,
      last24Hours: createdTimes.filter((created) => created >= since(1)).length,
      last7Days: createdTimes.filter((created) => created >= since(7)).length,
      last30Days: createdTimes.filter((created) => created >= since(30)).length,
    }
  }
  const presenceCutoff = new Date(now.getTime() - 60_000).toISOString()
  const presencePromise = supabase
    .from('agent_presence')
    .select('*', { count: 'exact', head: true })
    .gte('last_seen_at', presenceCutoff)
  const [auth, projects, comments, shares, presenceResult] = await Promise.all([
    loadAuthStats(), countTable('projects'), countTable('comments'), countTable('feedback_shares'),
    presencePromise,
  ])
  if (presenceResult.error) throw new Error(presenceResult.error.message)
  return {
    accounts: auth.accounts,
    projects,
    comments,
    shares,
    activeAgentPresence: presenceResult.count ?? 0,
    signups: {
      last24Hours: auth.last24Hours,
      last7Days: auth.last7Days,
      last30Days: auth.last30Days,
    },
  }
}

/**
 * Take ownership of a project. Two ways in:
 *  - Existing unclaimed project (widget-made): a conditional UPDATE flips
 *    `claimable=false`. Only the first caller wins the race; the rest see zero
 *    rows and either `already_claimed` (row exists) or fall through to create.
 *  - Brand-new project (dashboard create flow): when no row exists and a `name`
 *    is supplied, create the project (claimable=false) + seed its repo config,
 *    then add the caller as admin. A 23505 on insert means we lost the race.
 *
 * Without a `name`, a missing project is `not_found` (the paste-existing-key
 * path). The membership INSERT is idempotent — a duplicate (23505) just means
 * we already own it.
 */
export async function claimProject(
  userId: string,
  projectKey: string,
  name?: string,
): Promise<ReturnType<typeof mapProject>> {
  const supabase = getSupabase()

  const { data: updatedRows, error: updateError } = await supabase
    .from('projects')
    .update({ claimable: false, updated_at: new Date().toISOString() })
    .eq('public_key', projectKey)
    .eq('claimable', true)
    .select(PROJECT_COLUMNS)

  if (updateError) throw new Error(updateError.message)

  let claimed: ReturnType<typeof mapProject>

  if (!updatedRows || updatedRows.length === 0) {
    const existing = await getProject(projectKey)
    if (existing) throw new Error('already_claimed')
    if (!name) throw new Error('not_found')
    claimed = await createClaimedProject(projectKey, name)
  } else {
    claimed = mapProject(updatedRows[0] as ProjectRow)
  }

  const { error: memberError } = await supabase
    .from('project_members')
    .insert([{ project_key: projectKey, user_id: userId, role: 'admin' }] as never)

  if (memberError && memberError.code !== '23505') {
    throw new Error(memberError.message)
  }

  return claimed
}

/**
 * Insert a dashboard-created project (slug mirrors the public key, as in
 * `ensurePublicProject`) plus its default repo config. A 23505 on the project
 * insert means a concurrent claim won the key — surface as `already_claimed`.
 */
async function createClaimedProject(projectKey: string, name: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('projects')
    .insert([{
      public_key: projectKey,
      slug: projectKey,
      name,
      allowed_origins: [],
      claimable: false,
    }] as never)
    .select(PROJECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('already_claimed')
    throw new Error(error.message)
  }

  const { error: repoError } = await supabase
    .from('project_repo_configs')
    .insert([{ project_key: projectKey, default_branch: 'main' }] as never)

  if (repoError && repoError.code !== '23505') {
    throw new Error(repoError.message)
  }

  return mapProject(data as ProjectRow)
}

/** Slugify a display name into a candidate project key (matches the dashboard's rule). */
export function slugifyProjectKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** A project key is 1–63 chars of lowercase alphanumerics and single internal hyphens. */
export function isValidProjectKey(key: string): boolean {
  return key.length >= 1 && key.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)
}

/** True when no project row already owns this key (free to create). */
export async function isProjectKeyAvailable(projectKey: string): Promise<boolean> {
  return (await getProject(projectKey)) === null
}

/**
 * Return `base` if free, else `base-<suffix>` with a short random suffix,
 * probing until one is available. Throws `no_available_key` if it can't find
 * a free key within a bounded number of attempts.
 */
export async function suggestAvailableProjectKey(base: string): Promise<string> {
  if (await isProjectKeyAvailable(base)) return base
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
    if (await isProjectKeyAvailable(candidate)) return candidate
  }
  throw new Error('no_available_key')
}

export async function getProject(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('public_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapProject(data as ProjectRow) : null
}

/**
 * Update a project's mutable settings (display name, origin allowlist —
 * public_key and slug are immutable). Returns the updated project, or null
 * when no project matched the key so the caller can map that to a 404.
 */
export async function updateProject(projectKey: string, patch: { name?: string; allowedOrigins?: string[] }) {
  const supabase = getSupabase()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.allowedOrigins !== undefined) update.allowed_origins = patch.allowedOrigins

  const { data, error } = await supabase
    .from('projects')
    .update(update)
    .eq('public_key', projectKey)
    .select(PROJECT_COLUMNS)

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return null
  return mapProject(data[0] as ProjectRow)
}

export async function ensurePublicProject(publicKey: string) {
  const existing = await getProject(publicKey)
  if (existing) return existing

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('projects')
    .insert([{
      public_key: publicKey,
      slug: publicKey,
      name: publicKey,
      allowed_origins: [],
    }] as never)
    .select(PROJECT_COLUMNS)
    .single()

  if (error) {
    // 23505 = unique_violation. Concurrent insert won the race; refetch.
    if (error.code === '23505') {
      const refetched = await getProject(publicKey)
      if (refetched) return refetched
    }
    throw new Error(error.message)
  }

  const { error: repoError } = await supabase
    .from('project_repo_configs')
    .insert([{
      project_key: publicKey,
      default_branch: 'main',
    }] as never)

  if (repoError && repoError.code !== '23505') {
    throw new Error(repoError.message)
  }

  return mapProject(data as ProjectRow)
}

export async function getRepoConfig(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_repo_configs')
    .select(REPO_CONFIG_COLUMNS)
    .eq('project_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return mapRepoConfig(data as RepoConfigRow | null)
}

export async function getGithubIssueConnection(projectKey: string) {
  const { data, error } = await getSupabase()
    .from('project_repo_configs')
    .select('github_owner, github_repo, github_installation_id, github_connection_version')
    .eq('project_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const row = data as {
    github_owner: string | null
    github_repo: string | null
    github_installation_id: string | null
    github_connection_version: number
  } | null
  if (!row?.github_owner || !row.github_repo || !row.github_installation_id) return null
  return {
    owner: row.github_owner,
    repo: row.github_repo,
    installationId: row.github_installation_id,
    connectionVersion: row.github_connection_version,
  }
}

export async function getGithubConnectionVersion(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_repo_configs')
    .select('github_connection_version')
    .eq('project_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const version = (data as { github_connection_version?: unknown } | null)?.github_connection_version
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : 0
}

export async function listGitHubUserInstallations(userId: string) {
  const { data, error } = await getSupabase()
    .from('github_user_installations')
    .select(GITHUB_USER_INSTALLATION_COLUMNS)
    .eq('user_id', userId)
    .order('github_account_login')

  if (error) throw new Error(error.message)
  return ((data ?? []) as GitHubUserInstallationRow[]).map(publicGitHubUserInstallation)
}

export async function getGitHubUserInstallation(userId: string, installationRef: string) {
  const { data, error } = await getSupabase()
    .from('github_user_installations')
    .select(GITHUB_USER_INSTALLATION_COLUMNS)
    .eq('user_id', userId)
    .eq('id', installationRef)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapGitHubUserInstallation(data as GitHubUserInstallationRow) : null
}

export async function upsertGitHubUserInstallation(input: {
  userId: string
  installationId: string
  githubAccountId: string
  githubAccountLogin: string
  githubAccountType: 'User' | 'Organization'
}) {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('github_user_installations')
    .upsert([{
      user_id: input.userId,
      installation_id: input.installationId,
      github_account_id: input.githubAccountId,
      github_account_login: input.githubAccountLogin,
      github_account_type: input.githubAccountType,
      last_verified_at: now,
      updated_at: now,
    }] as never, { onConflict: 'user_id,installation_id' })
    .select(GITHUB_USER_INSTALLATION_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapGitHubUserInstallation(data as GitHubUserInstallationRow)
}

export async function deleteGitHubUserInstallation(userId: string, installationRef: string) {
  const { error } = await getSupabase()
    .from('github_user_installations')
    .delete()
    .eq('user_id', userId)
    .eq('id', installationRef)

  if (error) throw new Error(error.message)
}

export function normalizeGitHubRepoUrl(value: string): {
  repoUrl: string
  githubOwner: string
  githubRepo: string
} | null {
  const raw = value.trim()
  if (!raw) return null

  let owner = ''
  let repo = ''
  const shorthand = raw.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) {
    owner = shorthand[1]
    repo = shorthand[2]
  } else {
    try {
      const parsed = new URL(raw)
      if (parsed.hostname.toLowerCase() !== 'github.com') return null
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length < 2) return null
      owner = parts[0]
      repo = parts[1]
    } catch {
      return null
    }
  }

  const normalizedRepo = repo.replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(normalizedRepo)) {
    return null
  }

  return {
    repoUrl: `https://github.com/${owner}/${normalizedRepo}`,
    githubOwner: owner,
    githubRepo: normalizedRepo,
  }
}

export async function connectGithubRepo(
  projectKey: string,
  userId: string,
  repoUrl: string,
  installationId: string,
  expectedVersion: number,
) {
  const normalized = normalizeGitHubRepoUrl(repoUrl)
  if (!normalized) throw new Error('invalid_github_repo')

  const { data, error } = await getSupabase()
    .rpc('write_github_repo_connection_if_admin', {
      p_project_key: projectKey,
      p_user_id: userId,
      p_expected_version: expectedVersion,
      p_repo_url: normalized.repoUrl,
      p_github_owner: normalized.githubOwner,
      p_github_repo: normalized.githubRepo,
      p_github_installation_id: installationId,
    } as never)
    .select(REPO_CONFIG_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('stale_connection_attempt')
  return mapRepoConfig(data as RepoConfigRow)
}

const MAX_CONNECTION_WRITE_ATTEMPTS = 3

async function disconnectGithubRepoWithRetry(projectKey: string, userId: string) {
  const supabase = getSupabase()

  for (let attempt = 0; attempt < MAX_CONNECTION_WRITE_ATTEMPTS; attempt += 1) {
    const version = await getGithubConnectionVersion(projectKey)
    const { data, error } = await supabase
      .rpc('write_github_repo_connection_if_admin', {
        p_project_key: projectKey,
        p_user_id: userId,
        p_expected_version: version,
        p_repo_url: null,
        p_github_owner: null,
        p_github_repo: null,
        p_github_installation_id: null,
      } as never)
      .select(REPO_CONFIG_COLUMNS)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (data) return mapRepoConfig(data as RepoConfigRow)
  }

  throw new Error('stale_connection_attempt')
}

export async function disconnectGithubRepo(projectKey: string, userId: string) {
  return disconnectGithubRepoWithRetry(projectKey, userId)
}

export type RepoConfigPatch = {
  repoUrl?: string | null
  localPath?: string | null
  devCommand?: string | null
  testCommand?: string | null
  agentInstructions?: string | null
}

export async function updateRepoConfig(projectKey: string, patch: RepoConfigPatch) {
  const supabase = getSupabase()
  // Only touch the columns the caller provided: `undefined` leaves a field
  // as-is, `null` clears it. The upsert's ON CONFLICT UPDATE only sets the
  // supplied columns, so unrelated fields survive partial patches.
  const update: Record<string, unknown> = {
    project_key: projectKey,
    updated_at: new Date().toISOString(),
  }

  if (patch.repoUrl !== undefined) {
    const normalized = patch.repoUrl === null ? null : normalizeGitHubRepoUrl(patch.repoUrl)
    if (patch.repoUrl !== null && !normalized) throw new Error('invalid_github_repo')
    update.repo_url = normalized?.repoUrl ?? null
    update.github_owner = normalized?.githubOwner ?? null
    update.github_repo = normalized?.githubRepo ?? null
  }
  if (patch.localPath !== undefined) update.local_path = patch.localPath
  if (patch.devCommand !== undefined) update.dev_command = patch.devCommand
  if (patch.testCommand !== undefined) update.test_command = patch.testCommand
  if (patch.agentInstructions !== undefined) update.agent_instructions = patch.agentInstructions

  const { data, error } = await supabase
    .from('project_repo_configs')
    .upsert(update as never, { onConflict: 'project_key' })
    .select('project_key, repo_url, github_owner, github_repo, local_path, default_branch, install_command, dev_command, test_command, build_command, agent_instructions')
    .single()

  if (error) throw new Error(error.message)
  return mapRepoConfig(data as RepoConfigRow)
}

export async function createPublicComment(input: {
  projectKey: string
  pageUrl: string
  x: number
  y: number
  selector: string
  body: string
  imageUrl?: string | null
  authorName?: string | null
  targetType?: 'element_point' | 'text_range'
  anchor?: Record<string, unknown> | null
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .insert([{
      project_id: input.projectKey,
      url: input.pageUrl,
      x: input.x,
      y: input.y,
      element: input.selector,
      comment: input.body,
      status: 'pending',
      implementation_status: 'unassigned',
      created_by: 'public',
      image_url: input.imageUrl ?? null,
      author_name: input.authorName ?? null,
      target_type: input.targetType ?? 'element_point',
      anchor: input.anchor ?? null,
      updated_at: new Date().toISOString(),
    }] as never)
    .select(COMMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapComment(data as CommentRow)
}

export async function reserveCommentActivityEmail(projectKey: string, cooldownSeconds: number) {
  const supabase = getSupabase()
  const safeCooldownSeconds = Number.isFinite(cooldownSeconds)
    ? Math.max(0, Math.floor(cooldownSeconds))
    : 0
  if (safeCooldownSeconds <= 0) {
    return { shouldSend: true, activityCount: 1 }
  }

  const { data, error } = await supabase
    .rpc('reserve_comment_activity_email', {
      p_project_key: projectKey,
      p_cooldown_seconds: safeCooldownSeconds,
    })
    .single()

  if (error) throw new Error(error.message)
  const row = data as { should_send: boolean; activity_count: number } | null
  if (!row) throw new Error('reserve_comment_activity_email returned no row')
  return {
    shouldSend: row.should_send,
    activityCount: Number(row.activity_count),
  }
}

export async function releaseCommentActivityEmailReservation(projectKey: string, activityCount: number) {
  const safeActivityCount = Number.isFinite(activityCount)
    ? Math.max(1, Math.floor(activityCount))
    : 1
  const { error } = await getSupabase()
    .rpc('release_comment_activity_email_reservation', {
      p_project_key: projectKey,
      p_activity_count: safeActivityCount,
    })

  if (error) throw new Error(error.message)
}

export async function listComments(projectKey: string, filters: {
  pageUrl?: string
  reviewStatus?: ReviewStatus
  implementationStatus?: ImplementationStatus
} = {}) {
  const supabase = getSupabase()
  let query = supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectKey)

  if (filters.pageUrl) query = query.eq('url', filters.pageUrl)
  if (filters.reviewStatus) query = query.eq('status', toLegacyStatus(filters.reviewStatus))
  if (filters.implementationStatus) query = query.eq('implementation_status', filters.implementationStatus)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapComment(row as CommentRow))
}

export async function listProjectComments(projectKey: string, filters: {
  pageUrl?: string
  reviewStatus?: ReviewStatus
  implementationStatus?: ImplementationStatus
} = {}) {
  let query = getSupabase()
    .from('comments')
    .select(COMMENT_GITHUB_ISSUE_COLUMNS)
    .eq('project_id', projectKey)

  if (filters.pageUrl) query = query.eq('url', filters.pageUrl)
  if (filters.reviewStatus) query = query.eq('status', toLegacyStatus(filters.reviewStatus))
  if (filters.implementationStatus) query = query.eq('implementation_status', filters.implementationStatus)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapProjectComment(row as CommentRow))
}

export async function getCommentForGithubIssue(projectKey: string, commentId: string) {
  const { data, error } = await getSupabase()
    .from('comments')
    .select(COMMENT_GITHUB_ISSUE_COLUMNS)
    .eq('id', commentId)
    .eq('project_id', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as CommentRow
  return {
    ...mapProjectComment(row),
    githubIssueLeaseToken: row.github_issue_lease_token ?? null,
    githubIssueLeaseExpiresAt: row.github_issue_lease_expires_at ?? null,
    githubIssueUncertainAt: row.github_issue_uncertain_at ?? null,
  }
}

export async function claimCommentGithubIssue(
  projectKey: string,
  commentId: string,
  leaseToken: string,
  leaseMilliseconds = 5 * 60_000,
  recovery = false,
) {
  const leaseSeconds = Number.isFinite(leaseMilliseconds)
    ? Math.ceil(leaseMilliseconds / 1_000)
    : 5 * 60
  const { data, error } = await getSupabase()
    .rpc('claim_comment_github_issue', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_lease_token: leaseToken,
      p_lease_seconds: leaseSeconds,
      p_recovery: recovery,
    } as never)
    .select(COMMENT_GITHUB_ISSUE_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapProjectComment(data as CommentRow) : null
}

export async function finalizeCommentGithubIssue(
  projectKey: string,
  commentId: string,
  leaseToken: string,
  issue: { issueNumber: number; issueUrl: string; createdAt: string },
) {
  const { data, error } = await getSupabase()
    .rpc('finalize_comment_github_issue', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_lease_token: leaseToken,
      p_issue_number: issue.issueNumber,
      p_issue_url: issue.issueUrl,
      p_issue_created_at: issue.createdAt,
    } as never)

  if (error) throw new Error(error.message)
  return data === true
}

export async function releaseCommentGithubIssue(
  projectKey: string,
  commentId: string,
  leaseToken: string,
) {
  const { data, error } = await getSupabase()
    .rpc('release_comment_github_issue', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_lease_token: leaseToken,
    } as never)

  if (error) throw new Error(error.message)
  return data === true
}

export async function markCommentGithubIssueUncertain(
  projectKey: string,
  commentId: string,
  leaseToken: string,
) {
  const { data, error } = await getSupabase()
    .rpc('mark_comment_github_issue_uncertain', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_lease_token: leaseToken,
    } as never)

  if (error) throw new Error(error.message)
  return data === true
}

export async function resetCommentGithubIssueAttempt(
  projectKey: string,
  commentId: string,
  leaseToken: string,
) {
  const { data, error } = await getSupabase()
    .rpc('reset_comment_github_issue_attempt', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_lease_token: leaseToken,
    } as never)

  if (error) throw new Error(error.message)
  return data === true
}

export async function listAcceptedCommentsForPage(projectKey: string, pageUrl: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectKey)
    .eq('url', pageUrl)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapComment(row as CommentRow))
}

export async function listAcceptedCommentsByIds(projectKey: string, commentIds: string[]) {
  if (commentIds.length === 0) return []

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectKey)
    .eq('status', 'approved')
    .in('id', commentIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapComment(row as CommentRow))
}

export async function deleteCommentsForProject(projectKey: string) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('project_id', projectKey)

  if (error) throw new Error(error.message)
}

/**
 * Delete a single comment scoped by project. The projectKey acts as a soft
 * authorization boundary — same security model as `createPublicComment`: a
 * caller who knows the project key can mutate within that project.
 *
 * Returns `true` if a row was deleted, `false` if no matching row existed.
 */
export async function deleteCommentById(commentId: string, projectKey: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('project_id', projectKey)
    .select('id')

  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}

export async function getComment(commentId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('id', commentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapComment(data as CommentRow) : null
}

export async function updateReviewStatus(
  projectKey: string,
  commentId: string,
  reviewStatus: ReviewStatus,
) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('update_comment_review_status', {
      p_comment_id: commentId,
      p_project_key: projectKey,
      p_status: toLegacyStatus(reviewStatus),
    } as never)
    .select(COMMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapComment(data as CommentRow)
}

export async function updateImplementationStatus(commentId: string, patch: {
  implementationStatus?: ImplementationStatus
  claimedByAgentId?: string | null
}) {
  const supabase = getSupabase()
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.implementationStatus) updates.implementation_status = patch.implementationStatus
  if (patch.claimedByAgentId !== undefined) updates.claimed_by_agent_id = patch.claimedByAgentId

  const { data, error } = await supabase
    .from('comments')
    .update(updates)
    .eq('id', commentId)
    .select(COMMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapComment(data as CommentRow)
}

export async function createShare(input: {
  projectKey: string
  scopeType: 'page' | 'selection' | 'project'
  scopePageUrl: string | null
  slug: string
  accessTokenHash: string
  accessTokenCiphertext: string
  createdBy: string
  expiresAt: string
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_shares')
    .insert([{
      project_id: input.projectKey,
      scope_type: input.scopeType,
      scope_page_url: input.scopePageUrl,
      slug: input.slug,
      access_token_hash: input.accessTokenHash,
      access_token_ciphertext: input.accessTokenCiphertext,
      created_by: input.createdBy,
      expires_at: input.expiresAt,
    }] as never)
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .single()

  if (error) throw new Error(error.message)
  return mapShare(data as ShareRow)
}

export async function addShareItems(shareId: string, commentIds: string[]) {
  if (commentIds.length === 0) return
  const supabase = getSupabase()
  const rows = commentIds.map((commentId) => ({
    share_id: shareId,
    comment_id: commentId,
  }))

  const { error } = await supabase
    .from('feedback_share_items')
    .insert(rows as never)

  if (error) throw new Error(error.message)
}

export async function getShareById(shareId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_shares')
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .eq('id', shareId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapShare(data as ShareRow) : null
}

export async function getShareBySlug(slug: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_shares')
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapShare(data as ShareRow) : null
}

export async function listShareCommentIds(shareId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_share_items')
    .select('comment_id')
    .eq('share_id', shareId)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => String((row as { comment_id: string }).comment_id))
}

export async function shareContainsComment(
  share: { id: string; projectId: string; scopeType: 'page' | 'selection' | 'project' },
  commentId: string,
) {
  if (share.scopeType === 'project') {
    const comment = await getComment(commentId)
    if (!comment) return false
    if (comment.projectId !== share.projectId) return false
    return comment.reviewStatus === 'accepted'
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_share_items')
    .select('comment_id')
    .eq('share_id', share.id)
    .eq('comment_id', commentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function listCommentsForShare(share: {
  id: string
  projectId: string
  scopeType: 'page' | 'selection' | 'project'
  scopePageUrl: string | null
}) {
  if (share.scopeType === 'project') {
    return listAcceptedCommentsForProject(share.projectId)
  }

  const commentIds = await listShareCommentIds(share.id)
  if (commentIds.length === 0) return []

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .in('id', commentIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapComment(row as CommentRow))
}

export async function listAcceptedCommentsForProject(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectKey)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapComment(row as CommentRow))
}

/**
 * Replace a share's access token credentials in place. Used to self-heal
 * legacy rows whose ciphertext no longer authenticates under the current
 * SHARE_TOKEN_SECRET — the row survives, the token is reissued.
 */
export async function rotateShareToken(shareId: string, expected: {
  accessTokenHash: string
  accessTokenCiphertext: string
}, input: {
  accessTokenHash: string
  accessTokenCiphertext: string
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_shares')
    .update({
      access_token_hash: input.accessTokenHash,
      access_token_ciphertext: input.accessTokenCiphertext,
    } as never)
    .eq('id', shareId)
    .eq('access_token_hash', expected.accessTokenHash)
    .eq('access_token_ciphertext', expected.accessTokenCiphertext)
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapShare(data as ShareRow) : null
}

export async function getProjectShare(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_shares')
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .eq('project_id', projectKey)
    .eq('scope_type', 'project')
    .is('revoked_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapShare(data as ShareRow) : null
}

export async function createFeedbackEvent(input: {
  shareId: string
  commentId?: string | null
  actorType: string
  actorId: string
  eventType: string
  payload?: Record<string, unknown>
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_events')
    .insert([{
      share_id: input.shareId,
      comment_id: input.commentId || null,
      actor_type: input.actorType,
      actor_id: input.actorId,
      event_type: input.eventType,
      payload: input.payload || {},
    }] as never)
    .select('id, share_id, comment_id, actor_type, actor_id, event_type, payload, created_at')
    .single()

  if (error) throw new Error(error.message)
  return mapEvent(data as EventRow)
}

export async function listFeedbackEvents(shareId: string, after: number, limit: number) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_events')
    .select('id, share_id, comment_id, actor_type, actor_id, event_type, payload, created_at')
    .eq('share_id', shareId)
    .gt('id', after)
    .order('id', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapEvent(row as EventRow))
}

export async function getLatestShareRevision(shareId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_events')
    .select('id')
    .eq('share_id', shareId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? Number((data as { id: number }).id) : 0
}

export async function findActiveSharesForComment(commentId: string) {
  const supabase = getSupabase()
  const { data: items, error: itemsError } = await supabase
    .from('feedback_share_items')
    .select('share_id')
    .eq('comment_id', commentId)

  if (itemsError) throw new Error(itemsError.message)
  const shareIds = (items || []).map((row) => String((row as { share_id: string }).share_id))
  if (shareIds.length === 0) return []

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('feedback_shares')
    .select('id, project_id, scope_type, scope_page_url, slug, access_token_hash, access_token_ciphertext, created_by, expires_at, revoked_at, created_at')
    .in('id', shareIds)
    .is('revoked_at', null)
    .gt('expires_at', now)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapShare(row as ShareRow))
}

export async function getPresence(shareId: string, agentId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_presence')
    .select('share_id, agent_id, status, summary, last_seen_at')
    .eq('share_id', shareId)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapPresence(data as PresenceRow) : null
}

export async function upsertPresence(shareId: string, agentId: string, status: string, summary: string | null) {
  const supabase = getSupabase()
  const payload = {
    share_id: shareId,
    agent_id: agentId,
    status,
    summary,
    last_seen_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('agent_presence')
    .upsert([payload] as never, { onConflict: 'share_id,agent_id' })

  if (error) throw new Error(error.message)

  return payload
}

export async function listLivePresence(shareId: string, cutoffIso: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_presence')
    .select('share_id, agent_id, status, summary, last_seen_at')
    .eq('share_id', shareId)
    .gt('last_seen_at', cutoffIso)
    .order('last_seen_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapPresence(row as PresenceRow))
}

export async function getOperationKey(shareId: string, agentId: string, idempotencyKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('feedback_operation_keys')
    .select('share_id, agent_id, idempotency_key, feedback_event_id, created_at')
    .eq('share_id', shareId)
    .eq('agent_id', agentId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as { share_id: string, agent_id: string, idempotency_key: string, feedback_event_id: number | null, created_at: string } | null
}

export async function saveOperationKey(shareId: string, agentId: string, idempotencyKey: string, feedbackEventId: number | null) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('feedback_operation_keys')
    .insert([{
      share_id: shareId,
      agent_id: agentId,
      idempotency_key: idempotencyKey,
      feedback_event_id: feedbackEventId,
    }] as never)

  if (error) throw new Error(error.message)
}

export type NotificationKind = 'invite.received' | 'invite.accepted' | 'invite.declined' | 'comment.activity'

type NotificationRow = {
  id: string
  user_id: string
  kind: NotificationKind
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    payload: row.payload || {},
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

// Notifications has a `notifications_select_own` policy (the dashboard
// subscribes to its own rows over realtime with the authenticated key), so the
// backend — which holds no user JWT — must use the service-role client to read
// or write across users. These helpers enforce the user_id scope themselves.
export async function createNotification(input: {
  userId: string
  kind: NotificationKind
  payload?: Record<string, unknown>
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .insert([{ user_id: input.userId, kind: input.kind, payload: input.payload ?? {} }] as never)
    .select('id, user_id, kind, payload, read_at, created_at')
    .single()
  if (error) throw new Error(error.message)
  return mapNotification(data as NotificationRow)
}

export async function createOrIncrementCommentActivityNotification(input: {
  userId: string
  projectKey: string
  projectName: string
  commentId: string
  authorName?: string | null
  pageUrl: string
}) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('create_or_increment_comment_activity_notification', {
      p_user_id: input.userId,
      p_project_key: input.projectKey,
      p_project_name: input.projectName,
      p_comment_id: input.commentId,
      p_author_name: input.authorName ?? null,
      p_page_url: input.pageUrl,
    })
    .single()

  if (error) throw new Error(error.message)
  return mapNotification(data as NotificationRow)
}

export async function notifyProjectMembersOfCommentActivity(input: {
  projectKey: string
  projectName: string
  commentId: string
  authorName?: string | null
  pageUrl: string
}) {
  const memberIds = await listProjectMemberIds(input.projectKey)
  await Promise.all(memberIds.map((userId) =>
    createOrIncrementCommentActivityNotification({
      userId,
      projectKey: input.projectKey,
      projectName: input.projectName,
      commentId: input.commentId,
      authorName: input.authorName ?? null,
      pageUrl: input.pageUrl,
    }),
  ))
}

export async function listNotificationsForUser(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  const supabase = getSupabase()
  let query = supabase
    .from('notifications')
    .select('id, user_id, kind, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)
  if (opts.unreadOnly) query = query.is('read_at', null)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapNotification(row as NotificationRow))
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw new Error(error.message)
}

type InviteRow = {
  project_key: string
  email: string
  role: 'admin' | 'member'
  invited_by: string
  created_at: string
}

function mapInvite(row: InviteRow) {
  return {
    projectKey: row.project_key,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  }
}

export async function createInvite(input: {
  projectKey: string
  email: string
  role: 'admin' | 'member'
  invitedBy: string
}) {
  const supabase = getSupabase()
  const email = input.email.toLowerCase().trim()
  const { data, error } = await supabase
    .from('project_invites')
    .insert([{
      project_key: input.projectKey,
      email,
      role: input.role,
      invited_by: input.invitedBy,
    }] as never)
    .select('project_key, email, role, invited_by, created_at')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('already_invited')
    throw new Error(error.message)
  }
  return mapInvite(data as InviteRow)
}

export async function listInvitesForEmail(email: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_invites')
    .select('project_key, email, role, invited_by, created_at')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapInvite(row as InviteRow))
}

export async function listProjectInvites(projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_invites')
    .select('project_key, email, role, invited_by, created_at')
    .eq('project_key', projectKey)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => mapInvite(row as InviteRow))
}

/**
 * Cancel a pending invite. Returns false when no invite matched so the caller
 * can map that to a 404.
 */
export async function deleteProjectInvite(projectKey: string, email: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_invites')
    .delete()
    .eq('project_key', projectKey)
    .eq('email', email.toLowerCase().trim())
    .select('email')
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}

async function getInvite(email: string, projectKey: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('project_invites')
    .select('project_key, email, role, invited_by, created_at')
    .eq('email', email.toLowerCase().trim())
    .eq('project_key', projectKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapInvite(data as InviteRow) : null
}

async function deleteInvite(email: string, projectKey: string) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('project_invites')
    .delete()
    .eq('email', email.toLowerCase().trim())
    .eq('project_key', projectKey)
  if (error) throw new Error(error.message)
}

/**
 * Atomic invite acceptance: verify the invite exists for this email, insert
 * the project_members row (idempotent via 23505), delete the invite. Returns
 * the inviter's user_id so the caller can emit an `invite.accepted` notif.
 */
export async function acceptInvite(userId: string, email: string, projectKey: string): Promise<string> {
  const invite = await getInvite(email, projectKey)
  if (!invite) throw new Error('not_found')

  const supabase = getSupabase()
  const { error: insertError } = await supabase
    .from('project_members')
    .insert([{ project_key: projectKey, user_id: userId, role: invite.role }] as never)
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message)

  await deleteInvite(email, projectKey)
  return invite.invitedBy
}

export async function declineInvite(email: string, projectKey: string): Promise<string> {
  const invite = await getInvite(email, projectKey)
  if (!invite) throw new Error('not_found')
  await deleteInvite(email, projectKey)
  return invite.invitedBy
}

/**
 * Look up the auth.users id for an email. Uses the service role admin API if
 * a SUPABASE_SERVICE_ROLE_KEY is configured; otherwise returns null. The null
 * fallback is intentional — the invite still gets created, just no realtime
 * notif fires for the invitee (they'll see it on next login via GET /invites).
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const url = process.env.SUPABASE_URL
  if (!url) return null
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { users?: Array<{ id?: string; email?: string }> }
    const users = Array.isArray(body.users) ? body.users : []
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    return match?.id ?? null
  } catch {
    return null
  }
}
