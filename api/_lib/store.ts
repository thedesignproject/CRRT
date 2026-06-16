import { getServiceSupabase } from './supabase.js'
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
  created_at: string
  updated_at: string | null
}

// Single source of truth for comment selects — an omission here (or a
// hand-rolled select list elsewhere) silently drops fields from responses.
const COMMENT_COLUMNS =
  'id, project_id, url, x, y, element, comment, status, implementation_status, claimed_by_agent_id, image_url, author_name, target_type, anchor, created_at, updated_at'

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
  local_path: string | null
  default_branch: string | null
  install_command: string | null
  dev_command: string | null
  test_command: string | null
  build_command: string | null
  agent_instructions: string | null
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
  return {
    projectKey: row.project_key,
    repoUrl: row.repo_url,
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
  projectCount: number
}

/**
 * Super-admin view: every auth user, newest first, with how many projects each
 * belongs to. Users come from the auth admin API (paged); project counts are
 * tallied in-process from `project_members`.
 */
export async function listAllUsers(): Promise<AdminUser[]> {
  const supabase = getSupabase()

  const users: { id: string; email: string | null; created_at: string }[] = []
  const perPage = 200
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    const batch = data?.users ?? []
    for (const u of batch) {
      users.push({ id: u.id, email: u.email ?? null, created_at: u.created_at })
    }
    if (batch.length < perPage) break
    page += 1
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('project_members')
    .select('user_id')
  if (memberError) throw new Error(memberError.message)

  const counts = new Map<string, number>()
  for (const row of (memberRows || []) as { user_id: string }[]) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
  }

  return users
    .map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      projectCount: counts.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
  latestCommentAt: string
  claimed: boolean
  members: AdminProjectMember[]
}

/**
 * Super-admin view: every project that has received at least one comment,
 * ordered by most-recent comment. Per project: comment count, latest comment
 * time, whether it's been claimed (`claimable === false`), and every member
 * with their role + resolved email (admins are the owners; this also lets the
 * dashboard scope projects to any member). Comment stats are aggregated
 * in-process so a single scan of `comments` drives the project set.
 */
export async function listProjectsWithComments(): Promise<AdminProject[]> {
  const supabase = getSupabase()

  const { data: commentRows, error: commentError } = await supabase
    .from('comments')
    .select('project_id, created_at')
  if (commentError) throw new Error(commentError.message)

  const stats = new Map<string, { count: number; latest: string }>()
  for (const row of (commentRows || []) as { project_id: string | null; created_at: string }[]) {
    if (!row.project_id) continue
    const cur = stats.get(row.project_id)
    if (!cur) {
      stats.set(row.project_id, { count: 1, latest: row.created_at })
    } else {
      cur.count += 1
      if (row.created_at > cur.latest) cur.latest = row.created_at
    }
  }

  const keys = Array.from(stats.keys())
  if (keys.length === 0) return []

  const { data: projectRows, error: projectError } = await supabase
    .from('projects')
    .select('public_key, name, claimable, created_at')
    .in('public_key', keys)
  if (projectError) throw new Error(projectError.message)

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

  type AdminProjectRow = { public_key: string; name: string; claimable: boolean; created_at: string }
  return ((projectRows || []) as AdminProjectRow[])
    .map((row) => {
      const stat = stats.get(row.public_key) as { count: number; latest: string }
      const members = (membersByProject.get(row.public_key) ?? [])
        .map((m) => ({ email: emails[m.user_id], role: m.role }))
        .filter((m): m is AdminProjectMember => Boolean(m.email))
      return {
        publicKey: row.public_key,
        name: row.name,
        createdAt: row.created_at,
        commentCount: stat.count,
        latestCommentAt: stat.latest,
        claimed: row.claimable === false,
        members,
      }
    })
    .sort((a, b) => b.latestCommentAt.localeCompare(a.latestCommentAt))
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
    .select('project_key, repo_url, local_path, default_branch, install_command, dev_command, test_command, build_command, agent_instructions')
    .eq('project_key', projectKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return mapRepoConfig(data as RepoConfigRow | null)
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

export async function updateReviewStatus(commentId: string, reviewStatus: ReviewStatus) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('comments')
    .update({
      status: toLegacyStatus(reviewStatus),
      updated_at: new Date().toISOString(),
    })
    .eq('id', commentId)
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

export type NotificationKind = 'invite.received' | 'invite.accepted' | 'invite.declined'

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

