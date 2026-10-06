import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  pgView,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Row Level Security: every table below has RLS enabled with NO permissive
// policy (migration 0004_enable_rls), i.e. deny-all for the `anon` /
// `authenticated` roles. This is required because the publishable (anon) key
// ships in the dashboard bundle — without RLS anyone could query these tables
// directly via the Supabase REST API. The API reaches them through the
// service-role client (`getServiceSupabase`), which bypasses RLS and does its
// own authorization. `notifications` is the exception: it has a
// `notifications_select_own` policy (migration 0002) so the dashboard can
// subscribe to its own rows over realtime with the authenticated key.

export const projects = pgTable('projects', {
  publicKey: text('public_key').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  allowedOrigins: text('allowed_origins').array().notNull().default(sql`'{}'`),
  widgetPrivate: boolean('widget_private').notNull().default(false),
  feedbackAccess: text('feedback_access').notNull().default('team'),
  claimable: boolean('claimable').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ feedbackAccessCheck: check('projects_feedback_access_check', sql`${t.feedbackAccess} in ('team', 'admins')`) }))

// userId / invitedBy reference auth.users(id). Drizzle can't model the auth
// schema, so the FK is added in the migration SQL by hand (see DRIZZLE-GUIDE.md).
export const projectMembers = pgTable(
  'project_members',
  {
    projectKey: text('project_key')
      .notNull()
      .references(() => projects.publicKey, { onDelete: 'cascade' }),
    // References auth.users(id) ON DELETE CASCADE. Drizzle cannot model the
    // auth schema, so the generated migration adds this cross-schema FK.
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    isOwner: boolean('is_owner').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectKey, t.userId] }),
    userIdx: index('project_members_user_id_idx').on(t.userId),
    oneOwnerIdx: uniqueIndex('project_members_one_owner_idx')
      .on(t.projectKey)
      .where(sql`${t.isOwner}`),
    roleCheck: check('project_members_role_check', sql`${t.role} in ('admin', 'member', 'guest')`),
    ownerRoleCheck: check('project_members_owner_role_check', sql`not ${t.isOwner} or ${t.role} = 'admin'`),
  }),
)

// A GitHub App installation may be reused across multiple CRRT projects, and
// organization installations may be accessible to multiple CRRT users. Keep
// the private GitHub installation id behind an opaque row id and scope every
// runtime lookup by user_id.
export const githubUserInstallations = pgTable(
  'github_user_installations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    installationId: text('installation_id').notNull(),
    githubAccountId: text('github_account_id').notNull(),
    githubAccountLogin: text('github_account_login').notNull(),
    githubAccountType: text('github_account_type').notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('github_user_installations_user_id_idx').on(t.userId),
    userInstallationUnique: uniqueIndex('github_user_installations_user_installation_unique')
      .on(t.userId, t.installationId),
    accountTypeCheck: check(
      'github_user_installations_account_type_check',
      sql`${t.githubAccountType} in ('User', 'Organization')`,
    ),
  }),
).enableRLS()

// Global super-admin allowlist. Membership grants cross-tenant read access
// through the `/api/v1/admin/*` endpoints. `user_id` references auth.users(id);
// as with project_members, Drizzle can't model the auth schema so that FK is
// added by hand in the migration SQL. Grant by inserting a row.
export const superAdmins = pgTable('super_admins', {
  userId: uuid('user_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectInvites = pgTable(
  'project_invites',
  {
    projectKey: text('project_key')
      .notNull()
      .references(() => projects.publicKey, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    invitedBy: uuid('invited_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectKey, t.email] }),
    emailIdx: index('project_invites_email_idx').on(t.email),
    roleCheck: check('project_invites_role_check', sql`${t.role} in ('admin', 'member', 'guest')`),
    emailLowerCheck: check('project_invites_email_lower_check', sql`${t.email} = lower(${t.email})`),
  }),
)

// Reference only: not exported, so Drizzle does not manage Supabase's auth table.
const authUsers = pgSchema('auth').table('users', { id: uuid('id').primaryKey() })

// Company email discovery is separate from widget origin restrictions.
export const projectEmailDomains = pgTable('project_email_domains', {
  projectKey: text('project_key').notNull().references(() => projects.publicKey, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectKey, t.domain] }),
  domainIdx: index('project_email_domains_domain_idx').on(t.domain),
  normalized: check('project_email_domains_normalized', sql`${t.domain} = lower(${t.domain}) and length(${t.domain}) <= 253 and ${t.domain} ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'`),
})).enableRLS()

export const projectAccessRequests = pgTable('project_access_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectKey: text('project_key').notNull().references(() => projects.publicKey, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  status: text('status').notNull().default('pending'),
  attempt: integer('attempt').notNull().default(1),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => authUsers.id, { onDelete: 'set null' }),
  grantedRole: text('granted_role'),
}, (t) => ({
  userProject: uniqueIndex('project_access_requests_user_project_idx').on(t.projectKey, t.userId),
  userIdx: index('project_access_requests_user_idx').on(t.userId),
  statusCheck: check('project_access_requests_status_check', sql`${t.status} in ('pending', 'approved', 'declined')`),
  roleCheck: check('project_access_requests_role_check', sql`${t.grantedRole} in ('admin', 'member', 'guest')`),
  attemptCheck: check('project_access_requests_attempt_check', sql`${t.attempt} > 0`),
  emailCheck: check('project_access_requests_email_check', sql`${t.email} = lower(${t.email})`),
  reviewCheck: check('project_access_requests_review_check', sql`(${t.status} = 'pending' and ${t.reviewedAt} is null and ${t.grantedRole} is null) or (${t.status} = 'declined' and ${t.reviewedAt} is not null and ${t.grantedRole} is null) or (${t.status} = 'approved' and ${t.reviewedAt} is not null and ${t.grantedRole} is not null)`),
})).enableRLS()

// Server-managed allowlist for Chrome extension identities that may receive an
// authentication handoff. Removing a client also revokes its outstanding grants.
export const extensionAuthClients = pgTable(
  'extension_auth_clients',
  {
    extensionId: text('extension_id').primaryKey(),
    redirectUri: text('redirect_uri').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    extensionIdCheck: check('extension_auth_clients_extension_id_check', sql`${t.extensionId} ~ '^[a-p]{32}$'`),
    redirectCheck: check(
      'extension_auth_clients_redirect_uri_check',
      sql`${t.redirectUri} = 'https://' || ${t.extensionId} || '.chromiumapp.org/crrt-auth'`,
    ),
  }),
).enableRLS()

// One-time, server-created authorization grants used to establish a separate
// Supabase session inside the Chrome extension. Raw codes, state values, PKCE
// verifiers, and sessions never enter this table.
export const extensionAuthHandoffs = pgTable(
  'extension_auth_handoffs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    codeHash: text('code_hash').notNull(),
    stateHash: text('state_hash').notNull(),
    pkceChallenge: text('pkce_challenge').notNull(),
    userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    extensionId: text('extension_id').notNull().references(() => extensionAuthClients.extensionId, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeHashUnique: uniqueIndex('extension_auth_handoffs_code_hash_unique').on(t.codeHash),
    expiresIdx: index('extension_auth_handoffs_expires_at_idx').on(t.expiresAt),
    cleanupIdx: index('extension_auth_handoffs_cleanup_idx').on(t.consumedAt, t.expiresAt),
    codeHashCheck: check('extension_auth_handoffs_code_hash_check', sql`${t.codeHash} ~ '^[0-9a-f]{64}$'`),
    stateHashCheck: check('extension_auth_handoffs_state_hash_check', sql`${t.stateHash} ~ '^[0-9a-f]{64}$'`),
    pkceChallengeCheck: check('extension_auth_handoffs_pkce_challenge_check', sql`${t.pkceChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
    extensionIdCheck: check('extension_auth_handoffs_extension_id_check', sql`${t.extensionId} ~ '^[a-p]{32}$'`),
    redirectCheck: check(
      'extension_auth_handoffs_redirect_uri_check',
      sql`${t.redirectUri} = 'https://' || ${t.extensionId} || '.chromiumapp.org/crrt-auth'`,
    ),
    expiryCheck: check('extension_auth_handoffs_expiry_check', sql`${t.expiresAt} > ${t.createdAt}`),
    maxLifetimeCheck: check(
      'extension_auth_handoffs_max_lifetime_check',
      sql`${t.expiresAt} <= ${t.createdAt} + interval '5 minutes'`,
    ),
    consumedCheck: check(
      'extension_auth_handoffs_consumed_at_check',
      sql`${t.consumedAt} is null or ${t.consumedAt} >= ${t.createdAt}`,
    ),
  }),
).enableRLS()

// Opaque widget credentials are hashed at rest. A conditional UPDATE consumes
// each handoff once; the resulting session never grants dashboard access.
export const widgetAuthSessions = pgTable('widget_auth_sessions', {
  codeHash: text('code_hash').primaryKey(),
  stateHash: text('state_hash').notNull(),
  pkceChallenge: text('pkce_challenge').notNull(),
  userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  projectKey: text('project_key').notNull().references(() => projects.publicKey, { onDelete: 'cascade' }),
  origin: text('origin').notNull(),
  displayName: text('display_name').notNull(),
  handoffExpiresAt: timestamp('handoff_expires_at', { withTimezone: true }).notNull(),
  tokenHash: text('token_hash').unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}).enableRLS()

export const projectRepoConfigs = pgTable('project_repo_configs', {
  projectKey: text('project_key')
    .primaryKey()
    .references(() => projects.publicKey, { onDelete: 'cascade' }),
  repoUrl: text('repo_url'),
  githubOwner: text('github_owner'),
  githubRepo: text('github_repo'),
  githubInstallationId: text('github_installation_id'),
  githubConnectionVersion: integer('github_connection_version').notNull().default(0),
  localPath: text('local_path'),
  defaultBranch: text('default_branch').notNull().default('main'),
  installCommand: text('install_command'),
  devCommand: text('dev_command'),
  testCommand: text('test_command'),
  buildCommand: text('build_command'),
  agentInstructions: text('agent_instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// OAuth credentials for native issue-tracker integrations. Tokens are always
// encrypted by the API before they reach this table; RLS keeps the rows hidden
// from the publishable Supabase client shipped in browser bundles.
export const projectIntegrations = pgTable(
  'project_integrations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectKey: text('project_key').notNull().references(() => projects.publicKey, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    accessTokenCiphertext: text('access_token_ciphertext').notNull(),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    grantedScopes: text('granted_scopes'),
    workspaceId: text('workspace_id').notNull(),
    workspaceName: text('workspace_name').notNull(),
    containerId: text('container_id'),
    containerName: text('container_name'),
    createdBy: uuid('created_by').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectProviderUnique: uniqueIndex('project_integrations_project_provider_unique').on(t.projectKey, t.provider),
    providerCheck: check('project_integrations_provider_check', sql`${t.provider} in ('linear', 'jira')`),
  }),
).enableRLS()

export const projectCommentEmailCooldowns = pgTable('project_comment_email_cooldowns', {
  projectKey: text('project_key')
    .primaryKey()
    .references(() => projects.publicKey, { onDelete: 'cascade' }),
  pendingCount: integer('pending_count').notNull().default(0),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// A bounded rolling-hour ledger, independent of comment deletion. Versioned
// compare-and-swap updates through Supabase serialize concurrent reservations.
export const extensionCommentLimits = pgTable('extension_comment_limits', {
  userId: uuid('user_id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  attempts: timestamp('attempts', { withTimezone: true }).array().notNull().default(sql`'{}'::timestamptz[]`),
  version: uuid('version').notNull().default(sql`gen_random_uuid()`),
}).enableRLS()

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: text('project_id'),
    source: text('source').notNull().default('widget'),
    visibility: text('visibility').notNull().default('shared'),
    createdByUserId: uuid('created_by_user_id').references(() => authUsers.id, { onDelete: 'cascade' }),
    url: text('url'),
    pageHostname: text('page_hostname'),
    x: doublePrecision('x'),
    y: doublePrecision('y'),
    element: text('element'),
    comment: text('comment'),
    status: text('status').default('pending'),
    implementationStatus: text('implementation_status').default('unassigned'),
    claimedByAgentId: text('claimed_by_agent_id'),
    createdBy: text('created_by').default('public'),
    imageUrl: text('image_url'),
    screenshotStoragePath: text('screenshot_storage_path'),
    authorName: text('author_name'),
    // 'element_point' (click-to-pin) or 'text_range' (anchored to selected text)
    targetType: text('target_type').default('element_point'),
    // TextRangeAnchor JSON for text_range comments; null means no anchor
    anchor: jsonb('anchor'),
    githubIssueNumber: integer('github_issue_number'),
    githubIssueUrl: text('github_issue_url'),
    githubIssueCreatedAt: timestamp('github_issue_created_at', { withTimezone: true }),
    githubIssueLeaseToken: uuid('github_issue_lease_token'),
    githubIssueLeaseExpiresAt: timestamp('github_issue_lease_expires_at', { withTimezone: true }),
    githubIssueUncertainAt: timestamp('github_issue_uncertain_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectCreatedIdx: index('comments_project_created_idx').on(t.projectId, t.createdAt.desc()),
    projectUrlIdx: index('comments_project_url_idx').on(t.projectId, t.url, t.createdAt.desc()),
    projectStatusIdx: index('comments_project_status_idx').on(
      t.projectId,
      t.status,
      t.implementationStatus,
    ),
    extensionAuthorCreatedIdx: index('comments_extension_author_created_idx').on(
      t.createdByUserId,
      t.createdAt.desc(),
    ),
    extensionAuthorUrlIdx: index('comments_extension_author_url_idx').on(
      t.createdByUserId,
      t.url,
      t.createdAt.desc(),
    ),
    sourceCheck: check('comments_source_check', sql`${t.source} in ('widget', 'extension')`),
    visibilityCheck: check('comments_visibility_check', sql`${t.visibility} in ('shared', 'internal')`),
    extensionOwnershipCheck: check(
      'comments_extension_ownership_check',
      sql`${t.source} <> 'extension' or (${t.createdByUserId} is not null and ${t.pageHostname} is not null)`,
    ),
    githubIssueFieldsCheck: check(
      'comments_github_issue_fields_check',
      sql`(
        (${t.githubIssueNumber} is null and ${t.githubIssueUrl} is null and ${t.githubIssueCreatedAt} is null)
        or
        (${t.githubIssueNumber} > 0 and ${t.githubIssueUrl} is not null and ${t.githubIssueCreatedAt} is not null)
      )`,
    ),
    githubIssueLeaseCheck: check(
      'comments_github_issue_lease_check',
      sql`(
        (${t.githubIssueLeaseToken} is null and ${t.githubIssueLeaseExpiresAt} is null)
        or
        (${t.githubIssueLeaseToken} is not null and ${t.githubIssueLeaseExpiresAt} is not null)
      )`,
    ),
    githubIssueStateCheck: check(
      'comments_github_issue_state_check',
      sql`(
        (${t.githubIssueNumber} is null)
        or
        (${t.githubIssueLeaseToken} is null and ${t.githubIssueUncertainAt} is null)
      )`,
    ),
  }),
)

export const feedbackShares = pgTable(
  'feedback_shares',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.publicKey, { onDelete: 'cascade' }),
    scopeType: text('scope_type').notNull(),
    scopePageUrl: text('scope_page_url'),
    slug: text('slug').notNull().unique(),
    accessTokenHash: text('access_token_hash').notNull(),
    accessTokenCiphertext: text('access_token_ciphertext').notNull(),
    createdBy: text('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeTypeCheck: check(
      'feedback_shares_scope_type_check',
      sql`${t.scopeType} in ('page', 'selection', 'project')`,
    ),
    oneProjectScopePerProject: uniqueIndex('feedback_shares_one_project_scope_per_project')
      .on(t.projectId)
      .where(sql`scope_type = 'project' and revoked_at is null`),
  }),
)

export const feedbackShareItems = pgTable(
  'feedback_share_items',
  {
    shareId: uuid('share_id')
      .notNull()
      .references(() => feedbackShares.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shareId, t.commentId] }),
  }),
)

export const feedbackEvents = pgTable(
  'feedback_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => feedbackShares.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'set null' }),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shareIdIdx: index('feedback_events_share_id_idx').on(t.shareId, t.id),
  }),
)

export const agentPresence = pgTable(
  'agent_presence',
  {
    shareId: uuid('share_id')
      .notNull()
      .references(() => feedbackShares.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    status: text('status').notNull(),
    summary: text('summary'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shareId, t.agentId] }),
    shareSeenIdx: index('agent_presence_share_seen_idx').on(t.shareId, t.lastSeenAt.desc()),
  }),
)

// In-app notification feed. user_id references auth.users(id); the FK is
// added by hand in the migration SQL (same pattern as projectMembers).
// RLS + supabase_realtime publication also configured by hand in that
// migration so the dashboard can subscribe with the anon key.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('notifications_user_created_idx').on(t.userId, t.createdAt.desc()),
    unreadCommentActivityProjectIdx: uniqueIndex('notifications_unread_comment_activity_project_idx')
      .on(t.userId, sql`((payload->>'projectKey'))`)
      .where(sql`${t.kind} = 'comment.activity' and ${t.readAt} is null`),
    accessRequestAttemptIdx: uniqueIndex('notifications_access_request_attempt_idx')
      .on(t.userId, sql`((payload->>'requestId'))`, sql`((payload->>'attempt'))`)
      .where(sql`${t.kind} = 'project.access_requested'`),
    kindCheck: check(
      'notifications_kind_check',
      sql`${t.kind} in ('invite.received', 'invite.accepted', 'invite.declined', 'comment.activity', 'project.access_requested') and (${t.kind} not in ('comment.activity', 'project.access_requested') or nullif(btrim(${t.payload}->>'projectKey'), '') is not null)`,
    ),
  }),
)

export const feedbackOperationKeys = pgTable(
  'feedback_operation_keys',
  {
    shareId: uuid('share_id')
      .notNull()
      .references(() => feedbackShares.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    feedbackEventId: bigint('feedback_event_id', { mode: 'bigint' }).references(
      () => feedbackEvents.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shareId, t.agentId, t.idempotencyKey] }),
  }),
)

// Durable Product Audit state. Runtime access is service-role-only; API
// handlers authenticate project members or verify an anonymous capability
// before reading or mutating these deny-all-RLS tables.
export const auditRuns = pgTable(
  'audit_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectKey: text('project_key').references(() => projects.publicKey, { onDelete: 'cascade' }),
    creatorUserId: uuid('creator_user_id'),
    ownerKind: text('owner_kind').notNull(),
    startIdempotencyKey: text('start_idempotency_key').notNull(),
    capabilityTokenHash: text('capability_token_hash'),
    anonymousSessionHash: text('anonymous_session_hash'),
    anonymousIpHash: text('anonymous_ip_hash'),
    inputUrl: text('input_url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    mode: text('mode').notNull().default('live'),
    status: text('status').notNull().default('queued'),
    currentStage: text('current_stage').notNull().default('queued'),
    workflowRunId: text('workflow_run_id').unique(),
    budgets: jsonb('budgets').notNull().default(sql`'{}'::jsonb`),
    coverage: jsonb('coverage').notNull().default(sql`'{}'::jsonb`),
    unavailableSources: text('unavailable_sources').array().notNull().default(sql`'{}'`),
    sourceSnapshot: jsonb('source_snapshot').notNull().default(sql`'{}'::jsonb`),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    stageLeaseToken: uuid('stage_lease_token'),
    stageLeaseExpiresAt: timestamp('stage_lease_expires_at', { withTimezone: true }),
    retryNotBefore: timestamp('retry_not_before', { withTimezone: true }),
    stageAttempt: integer('stage_attempt').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectCreatedIdx: index('audit_runs_project_created_idx').on(t.projectKey, t.createdAt.desc()),
    anonymousSessionCreatedIdx: index('audit_runs_anonymous_session_created_idx')
      .on(t.anonymousSessionHash, t.createdAt.desc()),
    anonymousIpCreatedIdx: index('audit_runs_anonymous_ip_created_idx')
      .on(t.anonymousIpHash, t.createdAt.desc()),
    statusUpdatedIdx: index('audit_runs_status_updated_idx').on(t.status, t.updatedAt),
    expiresIdx: index('audit_runs_expires_idx').on(t.expiresAt),
    projectStartUnique: uniqueIndex('audit_runs_project_start_unique')
      .on(t.creatorUserId, t.startIdempotencyKey)
      .where(sql`${t.ownerKind} = 'project'`),
    anonymousStartUnique: uniqueIndex('audit_runs_anonymous_start_unique')
      .on(t.anonymousSessionHash, t.startIdempotencyKey)
      .where(sql`${t.ownerKind} = 'anonymous'`),
    ownerKindCheck: check(
      'audit_runs_owner_kind_check',
      sql`${t.ownerKind} in ('anonymous', 'project')`,
    ),
    ownerShapeCheck: check(
      'audit_runs_owner_shape_check',
      sql`(
        (${t.ownerKind} = 'project' and ${t.projectKey} is not null and ${t.creatorUserId} is not null)
        or
        (${t.ownerKind} = 'anonymous' and ${t.projectKey} is null and ${t.creatorUserId} is null
          and ${t.capabilityTokenHash} is not null and ${t.anonymousSessionHash} is not null
          and ${t.anonymousIpHash} is not null and ${t.expiresAt} is not null)
      )`,
    ),
    modeCheck: check('audit_runs_mode_check', sql`${t.mode} in ('local-fixture', 'live')`),
    statusCheck: check(
      'audit_runs_status_check',
      sql`${t.status} in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')`,
    ),
    stageCheck: check(
      'audit_runs_stage_check',
      sql`${t.currentStage} in ('queued', 'explorer', 'critic', 'verifier', 'completed', 'failed', 'cancelled')`,
    ),
    leaseShapeCheck: check(
      'audit_runs_lease_shape_check',
      sql`(${t.stageLeaseToken} is null) = (${t.stageLeaseExpiresAt} is null)`,
    ),
  }),
).enableRLS()

// One durable result per feedback item and provider prevents normal retries
// from creating duplicate work in external trackers.
export const commentExternalWork = pgTable(
  'comment_external_work',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: text('project_id').notNull().references(() => projects.publicKey, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    state: text('state').notNull().default('creating'),
    workspaceId: text('workspace_id'),
    containerId: text('container_id'),
    externalId: text('external_id'),
    externalKey: text('external_key'),
    externalUrl: text('external_url'),
    leaseToken: uuid('lease_token').notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
    uncertainAt: timestamp('uncertain_at', { withTimezone: true }),
    lifecycleStatus: text('lifecycle_status').notNull().default('active'),
    syncLeaseToken: uuid('sync_lease_token'),
    syncLeaseExpiresAt: timestamp('sync_lease_expires_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    commentProviderUnique: uniqueIndex('comment_external_work_comment_provider_unique').on(t.commentId, t.provider),
    projectCreatedIdx: index('comment_external_work_project_created_idx').on(t.projectId, t.createdAt.desc()),
    providerCheck: check('comment_external_work_provider_check', sql`${t.provider} in ('github', 'linear', 'jira')`),
    stateCheck: check('comment_external_work_state_check', sql`${t.state} in ('creating', 'created')`),
    lifecycleCheck: check(
      'comment_external_work_lifecycle_check',
      sql`${t.lifecycleStatus} in ('active', 'closing', 'closed', 'failed', 'blocked')`,
    ),
    lifecycleLeaseCheck: check(
      'comment_external_work_lifecycle_lease_check',
      sql`(
        (${t.lifecycleStatus} = 'closing' and ${t.syncLeaseToken} is not null and ${t.syncLeaseExpiresAt} is not null)
        or
        (${t.lifecycleStatus} <> 'closing' and ${t.syncLeaseToken} is null and ${t.syncLeaseExpiresAt} is null)
      )`,
    ),
    creationLifecycleCheck: check(
      'comment_external_work_creation_lifecycle_check',
      sql`${t.state} = 'created' or ${t.lifecycleStatus} = 'active'`,
    ),
    closedAtCheck: check(
      'comment_external_work_closed_at_check',
      sql`(${t.lifecycleStatus} = 'closed') = (${t.closedAt} is not null)`,
    ),
    resultCheck: check('comment_external_work_result_check', sql`(
      (${t.state} = 'creating' and ${t.externalId} is null and ${t.externalKey} is null and ${t.externalUrl} is null)
      or
      (${t.state} = 'created' and ${t.externalId} is not null and ${t.externalKey} is not null and ${t.externalUrl} is not null)
    )`),
  }),
).enableRLS()

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    auditId: uuid('audit_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    stage: text('stage'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditSequenceIdx: index('audit_events_audit_sequence_idx').on(t.auditId, t.id),
    idempotencyUnique: uniqueIndex('audit_events_idempotency_unique').on(t.auditId, t.idempotencyKey),
    eventTypeCheck: check(
      'audit_events_type_check',
      sql`${t.eventType} in (
        'audit.queued', 'audit.stage.started', 'audit.stage.rate_limited', 'audit.evidence.captured',
        'audit.stage.completed', 'audit.coverage.partial', 'audit.finding.verified',
        'audit.completed', 'audit.failed', 'audit.cancelled'
      )`,
    ),
    actorTypeCheck: check(
      'audit_events_actor_type_check',
      sql`${t.actorType} in ('system', 'explorer', 'critic', 'verifier', 'user')`,
    ),
  }),
).enableRLS()

export const auditEvidence = pgTable(
  'audit_evidence',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    auditId: uuid('audit_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
    evidenceKey: text('evidence_key').notNull(),
    source: text('source').notNull(),
    signalKey: text('signal_key').notNull(),
    kind: text('kind').notNull(),
    route: text('route').notNull(),
    element: text('element'),
    observation: text('observation').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    direct: boolean('direct').notNull(),
    provenance: jsonb('provenance').notNull().default(sql`'{}'::jsonb`),
    artifact: jsonb('artifact'),
    capture: jsonb('capture').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditEvidenceUnique: uniqueIndex('audit_evidence_audit_key_unique').on(t.auditId, t.evidenceKey),
    auditCreatedIdx: index('audit_evidence_audit_created_idx').on(t.auditId, t.createdAt),
    sourceCheck: check(
      'audit_evidence_source_check',
      sql`${t.source} in ('customer-rule', 'design-system', 'repository', 'url', 'heuristic')`,
    ),
    confidenceCheck: check(
      'audit_evidence_confidence_check',
      sql`${t.confidence} >= 0 and ${t.confidence} <= 1`,
    ),
  }),
).enableRLS()

export const auditCandidates = pgTable(
  'audit_candidates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    auditId: uuid('audit_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
    candidateKey: text('candidate_key').notNull(),
    payload: jsonb('payload').notNull(),
    decision: text('decision').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditCandidateUnique: uniqueIndex('audit_candidates_audit_key_unique').on(t.auditId, t.candidateKey),
    auditCreatedIdx: index('audit_candidates_audit_created_idx').on(t.auditId, t.createdAt),
    decisionCheck: check(
      'audit_candidates_decision_check',
      sql`${t.decision} in ('pending', 'admitted', 'rejected', 'merged')`,
    ),
  }),
).enableRLS()

export const auditFindings = pgTable(
  'audit_findings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    auditId: uuid('audit_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
    findingKey: text('finding_key').notNull(),
    rank: integer('rank').notNull(),
    status: text('status').notNull().default('open'),
    admittedBy: text('admitted_by').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditFindingUnique: uniqueIndex('audit_findings_audit_key_unique').on(t.auditId, t.findingKey),
    auditRankUnique: uniqueIndex('audit_findings_audit_rank_unique').on(t.auditId, t.rank),
    rankCheck: check('audit_findings_rank_check', sql`${t.rank} between 1 and 5`),
    statusCheck: check('audit_findings_status_check', sql`${t.status} = 'open'`),
    admittedByCheck: check(
      'audit_findings_admitted_by_check',
      sql`${t.admittedBy} in ('direct-evidence', 'independent-signals')`,
    ),
  }),
).enableRLS()

export const auditRateLimitWindows = pgTable(
  'audit_rate_limit_windows',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    identityKind: text('identity_kind').notNull(),
    identityHash: text('identity_hash').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
    requestCount: integer('request_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identityUnique: uniqueIndex('audit_rate_limit_windows_identity_unique')
      .on(t.identityKind, t.identityHash),
    windowIdx: index('audit_rate_limit_windows_window_idx').on(t.windowStartedAt),
    identityKindCheck: check(
      'audit_rate_limit_windows_identity_kind_check',
      sql`${t.identityKind} in ('session', 'ip')`,
    ),
    requestCountCheck: check(
      'audit_rate_limit_windows_request_count_check',
      sql`${t.requestCount} >= 0`,
    ),
  }),
).enableRLS()

// Service-role-only projections used by the super-admin API. securityInvoker
// preserves the underlying tables' deny-all RLS for browser-visible roles.
export const adminUserMetrics = pgView('admin_user_metrics', {
  userId: uuid('user_id'),
  adminProjectCount: bigint('admin_project_count', { mode: 'number' }),
  memberProjectCount: bigint('member_project_count', { mode: 'number' }),
  superAdmin: boolean('super_admin'),
})
  .with({ securityInvoker: true })
  .as(sql`
    with user_ids as (
      select user_id from ${projectMembers}
      union
      select user_id from ${superAdmins}
    )
    select u.user_id,
      count(pm.project_key) filter (where pm.role = 'admin')::bigint as admin_project_count,
      count(pm.project_key) filter (where pm.role = 'member')::bigint as member_project_count,
      (sa.user_id is not null) as super_admin
    from user_ids u
    left join ${projectMembers} pm on pm.user_id = u.user_id
    left join ${superAdmins} sa on sa.user_id = u.user_id
    group by u.user_id, sa.user_id
  `)

export const adminProjectMetrics = pgView('admin_project_metrics', {
  publicKey: text('public_key'),
  name: text('name'),
  claimable: boolean('claimable'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  commentCount: bigint('comment_count', { mode: 'number' }),
  pendingCommentCount: bigint('pending_comment_count', { mode: 'number' }),
  acceptedCommentCount: bigint('accepted_comment_count', { mode: 'number' }),
  rejectedCommentCount: bigint('rejected_comment_count', { mode: 'number' }),
  unassignedCommentCount: bigint('unassigned_comment_count', { mode: 'number' }),
  claimedCommentCount: bigint('claimed_comment_count', { mode: 'number' }),
  inProgressCommentCount: bigint('in_progress_comment_count', { mode: 'number' }),
  blockedCommentCount: bigint('blocked_comment_count', { mode: 'number' }),
  readyForTestingCommentCount: bigint('ready_for_testing_comment_count', { mode: 'number' }),
  doneCommentCount: bigint('done_comment_count', { mode: 'number' }),
  feedbackShareCount: bigint('feedback_share_count', { mode: 'number' }),
  commentedUrlCount: bigint('commented_url_count', { mode: 'number' }),
  firstCommentAt: timestamp('first_comment_at', { withTimezone: true }),
  lastCommentAt: timestamp('last_comment_at', { withTimezone: true }),
})
  .with({ securityInvoker: true })
  .as(sql`
    with comment_metrics as (
      select project_id,
        count(*)::bigint as comment_count,
        count(*) filter (where status is null or status not in ('approved', 'accepted', 'rejected'))::bigint as pending_comment_count,
        count(*) filter (where status in ('approved', 'accepted'))::bigint as accepted_comment_count,
        count(*) filter (where status = 'rejected')::bigint as rejected_comment_count,
        count(*) filter (where implementation_status is null or implementation_status = 'unassigned')::bigint as unassigned_comment_count,
        count(*) filter (where implementation_status = 'claimed')::bigint as claimed_comment_count,
        count(*) filter (where implementation_status = 'in_progress')::bigint as in_progress_comment_count,
        count(*) filter (where implementation_status = 'blocked')::bigint as blocked_comment_count,
        count(*) filter (where implementation_status = 'ready_for_testing')::bigint as ready_for_testing_comment_count,
        count(*) filter (where implementation_status = 'done')::bigint as done_comment_count,
        count(distinct url)::bigint as commented_url_count,
        min(created_at) as first_comment_at,
        max(created_at) as last_comment_at
      from ${comments}
      group by project_id
    ), share_metrics as (
      select project_id, count(*)::bigint as feedback_share_count
      from ${feedbackShares}
      group by project_id
    )
    select p.public_key, p.name, p.claimable, p.created_at,
      cm.comment_count, cm.pending_comment_count, cm.accepted_comment_count,
      cm.rejected_comment_count, cm.unassigned_comment_count,
      cm.claimed_comment_count, cm.in_progress_comment_count,
      cm.blocked_comment_count, cm.ready_for_testing_comment_count,
      cm.done_comment_count,
      coalesce(sm.feedback_share_count, 0)::bigint as feedback_share_count,
      cm.commented_url_count, cm.first_comment_at, cm.last_comment_at
    from ${projects} p
    join comment_metrics cm on cm.project_id = p.public_key
    left join share_metrics sm on sm.project_id = p.public_key
  `)

// Server-only outbox. Each immutable body is a private Resend batch; never expose
// recipient addresses or email content through an authenticated/anon RLS policy.
export const commentEmailBatches = pgTable('comment_email_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: uuid('delivery_id').notNull(),
  batchIndex: integer('batch_index').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  leaseToken: uuid('lease_token'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  deliveryBatchUnique: uniqueIndex('comment_email_batches_delivery_batch_unique').on(t.deliveryId, t.batchIndex),
  dueIdx: index('comment_email_batches_due_idx').on(t.status, t.nextAttemptAt),
  statusCheck: check('comment_email_batches_status_check', sql`${t.status} in ('pending', 'sent', 'failed')`),
})).enableRLS()

// One billing account per authenticated owner; future limits resolve project
// ownership at request time. No paid entitlement enforcement in billing v1.
export const billingAccounts = pgTable('billing_accounts', {
  userId: uuid('user_id').primaryKey().references(() => authUsers.id, { onDelete: 'restrict' }),
  customerId: text('customer_id').unique(),
  subscriptionId: text('subscription_id').unique(),
  subscriptionStatus: text('subscription_status'),
  priceId: text('price_id'),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  checkoutAttempt: uuid('checkout_attempt').notNull().default(sql`gen_random_uuid()`),
  checkoutSessionId: text('checkout_session_id'),
  lockToken: uuid('lock_token'),
  lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()

export const billingWebhookEvents = pgTable('billing_webhook_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()

// Drizzle does not model functions/triggers or the historical realtime policy.
// Keep their source here alongside the columns they protect; migration 0031
// includes this SQL after its generated column additions.
export const projectPrivacyGuardsSql = `
CREATE FUNCTION public.project_feedback_allowed(p_project text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_members m ON m.project_key = p.public_key
    WHERE p.public_key = p_project AND m.user_id = auth.uid()
      AND (NOT p.widget_private OR p.feedback_access <> 'admins' OR m.role = 'admin' OR m.is_owner)
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.project_feedback_allowed(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.project_feedback_allowed(text) TO authenticated, service_role;
--> statement-breakpoint
ALTER POLICY notifications_select_own ON public.notifications
USING (auth.uid() = user_id AND (kind <> 'comment.activity' OR public.project_feedback_allowed(payload->>'projectKey')));
--> statement-breakpoint
CREATE FUNCTION public.guard_private_widget_comment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_private boolean;
BEGIN
  IF NEW.source = 'widget' AND NEW.created_by = 'public' AND NEW.created_by_user_id IS NULL THEN
    SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = NEW.project_id FOR SHARE;
    IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_private_widget_comment BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.guard_private_widget_comment();
--> statement-breakpoint
CREATE FUNCTION public.guard_private_feedback_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_private boolean; v_access text;
BEGIN
  IF NEW.kind = 'comment.activity' THEN
    SELECT p.widget_private, p.feedback_access INTO v_private, v_access
      FROM public.projects p WHERE p.public_key = NEW.payload->>'projectKey' FOR SHARE;
    IF v_private AND v_access = 'admins' AND NOT EXISTS (
      SELECT 1 FROM public.project_members m WHERE m.project_key = NEW.payload->>'projectKey'
        AND m.user_id = NEW.user_id AND (m.role = 'admin' OR m.is_owner)
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_private_feedback_notification BEFORE INSERT OR UPDATE OF payload ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_private_feedback_notification();
--> statement-breakpoint
-- Acquire the project lock before the existing RPC takes notification-row
-- locks, matching the settings cleanup order and avoiding deadlocks.
--> statement-breakpoint
ALTER FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text)
RENAME TO create_or_increment_comment_activity_notification_unchecked;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_or_increment_comment_activity_notification_unchecked(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_or_increment_comment_activity_notification_unchecked(uuid, text, text, uuid, text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.create_or_increment_comment_activity_notification(
  p_user_id uuid, p_project_key text, p_project_name text, p_comment_id uuid, p_author_name text, p_page_url text
) RETURNS TABLE(id uuid, user_id uuid, kind text, payload jsonb, read_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR SHARE;
  RETURN QUERY SELECT * FROM public.create_or_increment_comment_activity_notification_unchecked(
    p_user_id, p_project_key, p_project_name, p_comment_id, p_author_name, p_page_url
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_or_increment_comment_activity_notification(uuid, text, text, uuid, text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.cleanup_restricted_project_feedback()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.widget_private AND NEW.feedback_access = 'admins' THEN
    DELETE FROM public.notifications n WHERE n.kind = 'comment.activity' AND n.payload->>'projectKey' = NEW.public_key
      AND NOT EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_key = NEW.public_key
        AND m.user_id = n.user_id AND (m.role = 'admin' OR m.is_owner));
    UPDATE public.comment_email_batches b SET status = 'failed', last_error = 'project_privacy_changed'
      WHERE b.status = 'pending' AND EXISTS (SELECT 1 FROM public.comments c
        WHERE c.id = b.delivery_id AND c.project_id = NEW.public_key);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cleanup_restricted_project_feedback AFTER UPDATE OF widget_private, feedback_access ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.cleanup_restricted_project_feedback();
--> statement-breakpoint
CREATE FUNCTION public.read_public_comments(p_project text, p_page_url text DEFAULT NULL)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean;
BEGIN
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = p_project FOR SHARE;
  IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id = p_project AND c.visibility = 'shared'
    AND (p_page_url IS NULL OR c.url = p_page_url) ORDER BY c.created_at DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_public_comments(text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_public_comments(text, text) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.mutate_public_comment(p_project text, p_comment uuid, p_status text DEFAULT NULL, p_delete boolean DEFAULT false)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean;
BEGIN
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key = p_project FOR SHARE;
  IF v_private THEN RAISE EXCEPTION 'private_feedback_login_required'; END IF;
  IF NOT p_delete AND (p_status IS NULL OR p_status NOT IN ('pending', 'approved', 'rejected')) THEN
    RAISE EXCEPTION 'invalid_review_status';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project, 0));
  PERFORM 1 FROM public.comments c WHERE c.id = p_comment AND c.project_id = p_project
    AND c.visibility = 'shared' AND c.created_by_user_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_delete THEN
    RETURN QUERY DELETE FROM public.comments c WHERE c.id = p_comment AND c.project_id = p_project RETURNING c.*;
  ELSE
    RETURN QUERY SELECT * FROM public.update_comment_review_status(p_comment, p_project, p_status);
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mutate_public_comment(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mutate_public_comment(text, uuid, text, boolean) TO service_role;
--> statement-breakpoint
-- A claimed delivery owns a durable fence until its worker checkpoints. A
-- crashed worker is reclaimed by the existing lease/retry mechanism; privacy
-- never silently expires this fence underneath a paused sender.
CREATE FUNCTION public.claim_comment_email_batch(p_id uuid, p_attempts integer, p_next_attempt timestamptz, p_token uuid, p_lease_until timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text; v_comment uuid;
BEGIN
  SELECT c.project_id, c.id INTO v_project, v_comment FROM public.comment_email_batches b
    JOIN public.comments c ON c.id = b.delivery_id WHERE b.id = p_id;
  PERFORM 1 FROM public.projects p WHERE p.public_key = v_project FOR SHARE;
  PERFORM 1 FROM public.comments c WHERE c.id = v_comment FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.comment_email_batches b SET status = 'failed', lease_token = NULL, last_error = 'comment_removed'
      WHERE b.id = p_id AND b.status = 'pending' AND b.attempts = p_attempts AND b.next_attempt_at = p_next_attempt;
    RETURN false;
  END IF;
  UPDATE public.comment_email_batches b SET lease_token = p_token, attempts = b.attempts + 1, next_attempt_at = p_lease_until
    WHERE b.id = p_id AND b.status = 'pending' AND b.attempts = p_attempts AND b.next_attempt_at = p_next_attempt;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_comment_email_batch(uuid, integer, timestamptz, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_email_batch(uuid, integer, timestamptz, uuid, timestamptz) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.fence_project_privacy_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.widget_private AND NEW.feedback_access = 'admins' AND EXISTS (
    SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id = b.delivery_id
    WHERE c.project_id = NEW.public_key AND b.status = 'pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_project_privacy_delivery BEFORE UPDATE OF widget_private, feedback_access ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.fence_project_privacy_delivery();
--> statement-breakpoint
-- Preserve the delivery-to-project association while a sender holds its fence.
CREATE FUNCTION public.fence_comment_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.comment_email_batches b WHERE b.delivery_id = OLD.id
    AND b.status = 'pending' AND b.lease_token IS NOT NULL) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_comment_delivery_delete BEFORE DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.fence_comment_delivery_delete();
`


// Review hardening is installed by migration 0032; keep 0031 immutable.
export const projectPrivacyReviewSql = `
CREATE OR REPLACE FUNCTION public.project_feedback_allowed(p_project text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_members m ON m.project_key = p.public_key
    WHERE p.public_key = p_project AND m.user_id = auth.uid()
      AND (NOT p.widget_private OR p.feedback_access = 'team'
        OR (p.feedback_access = 'admins' AND (m.role = 'admin' OR m.is_owner)))
  );
$$;
--> statement-breakpoint
-- Project-first locking matches email claims and privacy commits. Preserve the
-- existing RPC authorization/owner protections behind service-only wrappers.
ALTER FUNCTION public.change_project_member_role(text, uuid, uuid, text) RENAME TO change_project_member_role_unfenced;
--> statement-breakpoint
ALTER FUNCTION public.remove_project_member(text, uuid, uuid) RENAME TO remove_project_member_unfenced;
--> statement-breakpoint
CREATE FUNCTION public.change_project_member_role(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.change_project_member_role_unfenced(p_project_key, p_actor_user_id, p_target_user_id, p_role);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.remove_project_member(p_project_key text, p_actor_user_id uuid, p_target_user_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project_key FOR UPDATE;
  RETURN public.remove_project_member_unfenced(p_project_key, p_actor_user_id, p_target_user_id);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.fence_project_member_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- A direct/cascade write already holds a member row. Never wait here for a
  -- project held by a member-management RPC: that RPC may need this same row.
  BEGIN
    PERFORM 1 FROM public.projects p WHERE p.public_key = OLD.project_key FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'project_membership_busy' USING ERRCODE = '55P03';
  END;
  IF public.tracker_dispatch_pending(OLD.project_key) THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF EXISTS (SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id = b.delivery_id
    WHERE c.project_id = OLD.project_key AND b.status = 'pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fence_project_member_delivery BEFORE DELETE OR UPDATE OF role, is_owner, user_id, project_key ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.fence_project_member_delivery();
--> statement-breakpoint
CREATE FUNCTION public.update_project_settings(p_project text, p_actor uuid, p_patch jsonb)
RETURNS SETOF public.projects LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects p WHERE p.public_key = p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.project_members m WHERE m.project_key = p_project AND m.user_id = p_actor AND m.role = 'admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY UPDATE public.projects p SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE p.name END,
    allowed_origins = CASE WHEN p_patch ? 'allowed_origins' THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'allowed_origins')) ELSE p.allowed_origins END,
    widget_private = CASE WHEN p_patch ? 'widget_private' THEN (p_patch->>'widget_private')::boolean ELSE p.widget_private END,
    feedback_access = CASE WHEN p_patch ? 'feedback_access' THEN p_patch->>'feedback_access' ELSE p.feedback_access END,
    updated_at = now()
    WHERE p.public_key = p_project RETURNING p.*;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_project_member_role(text, uuid, uuid, text), public.remove_project_member(text, uuid, uuid),
  public.change_project_member_role_unfenced(text, uuid, uuid, text), public.remove_project_member_unfenced(text, uuid, uuid),
  public.update_project_settings(text, uuid, jsonb) TO service_role;
`

// Atomic reads close the gap between an API access check and its query.
export const projectPrivacyReadSql = `
CREATE FUNCTION public.read_project_feedback(p_project text, p_actor uuid)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean; v_access text; v_role text; v_owner boolean;
BEGIN
  SELECT p.widget_private, p.feedback_access INTO v_private, v_access FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role, m.is_owner INTO v_role, v_owner FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  IF v_role IS NULL OR (v_private AND NOT (v_access='team' OR (v_access='admins' AND (v_role='admin' OR v_owner)))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id=p_project AND (v_role <> 'guest' OR c.visibility='shared');
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.lock_agent_share(p_share uuid, p_token_hash text)
RETURNS public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text; v_private boolean;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key=v_project FOR SHARE;
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=p_share FOR SHARE;
  IF NOT FOUND OR p_token_hash IS NULL OR v_share.access_token_hash IS DISTINCT FROM p_token_hash
    OR v_share.revoked_at IS NOT NULL OR v_share.expires_at <= clock_timestamp()
    OR (v_share.created_by='system' AND v_private) THEN RAISE EXCEPTION 'share_unavailable'; END IF;
  RETURN v_share;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_share_feedback(p_share uuid, p_token_hash text DEFAULT NULL)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE;
BEGIN
  v_share := public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.project_id=v_share.project_id AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type='project' OR EXISTS (SELECT 1 FROM public.feedback_share_items i WHERE i.share_id=p_share AND i.comment_id=c.id));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_project_feedback(text, uuid), public.read_share_feedback(uuid,text), public.lock_agent_share(uuid,text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_project_feedback(text, uuid), public.read_share_feedback(uuid,text), public.lock_agent_share(uuid,text) TO service_role;
`

// Operations returning feedback use the same project-first privacy boundary.
export const projectPrivacyOperationsSql = `
ALTER FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text) RENAME TO apply_agent_feedback_operation_unchecked;
--> statement-breakpoint
CREATE FUNCTION public.apply_agent_feedback_operation(p_share_id uuid, p_comment_id uuid, p_agent_id text, p_idempotency_key text,
  p_operation text, p_event_type text, p_payload jsonb, p_implementation_status text, p_token_hash text DEFAULT NULL)
RETURNS TABLE(outcome text, event_id bigint, comment_row jsonb) LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text;
BEGIN
  v_share := public.lock_agent_share(p_share_id,p_token_hash);
  v_project := v_share.project_id;
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment_id AND c.project_id=v_project AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url) FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::bigint,NULL::jsonb; RETURN; END IF;
  IF v_share.scope_type <> 'project' THEN
    PERFORM 1 FROM public.feedback_share_items i WHERE i.share_id=p_share_id AND i.comment_id=p_comment_id FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::bigint,NULL::jsonb; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.apply_agent_feedback_operation_unchecked(p_share_id, p_comment_id, p_agent_id,
    p_idempotency_key, p_operation, p_event_type, p_payload, p_implementation_status);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text, text),
 public.apply_agent_feedback_operation_unchecked(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_agent_feedback_operation(uuid, uuid, text, text, text, text, jsonb, text, text),
 public.apply_agent_feedback_operation_unchecked(uuid, uuid, text, text, text, text, jsonb, text) TO service_role;
`

// Actor-bound operations and credential issuance share the project privacy fence.
export const projectPrivacyActorSql = `
-- Membership revocations cannot commit while this project lock is held. Plain
-- membership reads avoid the inverse row->project order of direct/cascade writes.
CREATE FUNCTION public.lock_feedback_actor(p_project text, p_actor uuid, p_capability text)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_private boolean; v_access text; v_role text;
BEGIN
  SELECT p.widget_private, p.feedback_access INTO v_private,v_access FROM public.projects p WHERE p.public_key=p_project FOR SHARE;
  SELECT m.role INTO v_role FROM public.project_members m WHERE m.project_key=p_project AND m.user_id=p_actor;
  IF v_role IS NULL OR p_capability IS NULL OR p_capability NOT IN ('feedback:read','feedback:manage','agent:operate','integrations:send')
    OR (p_capability <> 'feedback:read' AND v_role NOT IN ('admin','member'))
    OR (v_private AND NOT (v_access='team' OR (v_access='admins' AND v_role='admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN v_role;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_actor_comment(p_project text, p_actor uuid, p_comment uuid, p_capability text)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  v_role := public.lock_feedback_actor(p_project,p_actor,p_capability);
  RETURN QUERY SELECT c.* FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project
    AND (v_role <> 'guest' OR c.visibility='shared') FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.mutate_actor_feedback(p_project text, p_actor uuid, p_comment uuid, p_patch jsonb)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'feedback:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_patch ? 'status' THEN
    -- Preserve the existing GitHub creation/uncertainty fence.
    PERFORM * FROM public.update_comment_review_status(p_comment,p_project,p_patch->>'status');
  END IF;
  IF p_patch ? 'visibility' AND p_patch->>'visibility' NOT IN ('shared','internal') THEN RAISE EXCEPTION 'invalid_visibility'; END IF;
  RETURN QUERY UPDATE public.comments c SET
    visibility=CASE WHEN p_patch ? 'visibility' THEN p_patch->>'visibility' ELSE c.visibility END,
    implementation_status=CASE WHEN p_patch ? 'implementation_status' THEN p_patch->>'implementation_status' ELSE c.implementation_status END,
    claimed_by_agent_id=CASE WHEN p_patch ? 'claimed_by_agent_id' THEN p_patch->>'claimed_by_agent_id' ELSE c.claimed_by_agent_id END,
    updated_at=now() WHERE c.id=p_comment AND c.project_id=p_project RETURNING c.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.accept_actor_comment_if_open(p_project text,p_actor uuid,p_comment uuid)
RETURNS SETOF public.comments LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  RETURN QUERY UPDATE public.comments c SET status='approved',updated_at=now()
    WHERE c.id=p_comment AND c.project_id=p_project AND c.status='pending' RETURNING c.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.create_actor_share(p_project text, p_actor uuid, p_share jsonb, p_comments uuid[])
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_share public.feedback_shares%ROWTYPE;
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'agent:operate');
  IF p_share->>'scope_type' NOT IN ('page','selection') OR (p_share->>'scope_type'='page' AND nullif(p_share->>'scope_page_url','') IS NULL) THEN RAISE EXCEPTION 'invalid_share_scope'; END IF;
  SELECT array_agg(eligible.id) INTO v_ids FROM (
    SELECT c.id FROM public.comments c WHERE c.id=ANY(p_comments) AND c.project_id=p_project AND c.visibility='shared' AND c.status='approved'
      AND (p_share->>'scope_type' <> 'page' OR c.url=p_share->>'scope_page_url') ORDER BY c.id FOR SHARE
  ) eligible;
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) <> cardinality(p_comments) THEN RAISE EXCEPTION 'share_comments_changed'; END IF;
  INSERT INTO public.feedback_shares(project_id,scope_type,scope_page_url,slug,access_token_hash,access_token_ciphertext,created_by,expires_at)
    VALUES(p_project,p_share->>'scope_type',p_share->>'scope_page_url',p_share->>'slug',p_share->>'access_token_hash',p_share->>'access_token_ciphertext','reviewer',(p_share->>'expires_at')::timestamptz)
    RETURNING * INTO v_share;
  INSERT INTO public.feedback_share_items(share_id,comment_id) SELECT v_share.id,unnest(v_ids);
  INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
    VALUES(v_share.id,'reviewer',p_actor::text,'share.created',jsonb_build_object('scopeType',v_share.scope_type,'commentCount',cardinality(v_ids)));
  RETURN NEXT v_share;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.read_actor_share(p_share uuid, p_actor uuid)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'agent:operate');
  RETURN QUERY SELECT s.* FROM public.feedback_shares s WHERE s.id=p_share AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.rotate_actor_share(p_share uuid,p_actor uuid,p_expected_hash text,p_expected_cipher text,p_hash text,p_cipher text)
RETURNS SETOF public.feedback_shares LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_project text;
BEGIN
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=p_share;
  PERFORM public.lock_feedback_actor(v_project,p_actor,'agent:operate');
  RETURN QUERY UPDATE public.feedback_shares s SET access_token_hash=p_hash,access_token_ciphertext=p_cipher
    WHERE s.id=p_share AND s.access_token_hash=p_expected_hash AND s.access_token_ciphertext=p_expected_cipher
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() RETURNING s.*;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lock_feedback_actor(text,uuid,text), public.read_actor_comment(text,uuid,uuid,text),
 public.accept_actor_comment_if_open(text,uuid,uuid), public.mutate_actor_feedback(text,uuid,uuid,jsonb), public.create_actor_share(text,uuid,jsonb,uuid[]), public.read_actor_share(uuid,uuid),
 public.rotate_actor_share(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.lock_feedback_actor(text,uuid,text), public.read_actor_comment(text,uuid,uuid,text),
 public.accept_actor_comment_if_open(text,uuid,uuid), public.mutate_actor_feedback(text,uuid,uuid,jsonb), public.create_actor_share(text,uuid,jsonb,uuid[]), public.read_actor_share(uuid,uuid),
 public.rotate_actor_share(uuid,uuid,text,text,text,text) TO service_role;
`

// Agent streams and presence use the same current-token boundary as comment ops.
export const projectPrivacyAgentSql = `
CREATE FUNCTION public.read_agent_events(p_share uuid,p_token_hash text,p_after bigint,p_limit integer)
RETURNS SETOF public.feedback_events LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE;
BEGIN
  v_share := public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT e.* FROM public.feedback_events e WHERE e.share_id=p_share AND e.id>p_after
    AND ((e.comment_id IS NULL AND e.event_type IN ('presence.updated','share.created')) OR EXISTS(
      SELECT 1 FROM public.comments c WHERE c.id=e.comment_id AND c.project_id=v_share.project_id AND c.visibility='shared' AND c.status='approved'
        AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url)
        AND (v_share.scope_type='project' OR EXISTS(SELECT 1 FROM public.feedback_share_items i WHERE i.share_id=p_share AND i.comment_id=c.id))
    ))
    ORDER BY e.id LIMIT greatest(1,least(100,p_limit));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.write_agent_presence(p_share uuid,p_token_hash text,p_agent text,p_status text,p_summary text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_previous public.agent_presence%ROWTYPE;
BEGIN
  PERFORM public.lock_agent_share(p_share,p_token_hash);
  -- Serialize first insert as well as updates for this share/agent.
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-presence:' || p_share::text || ':' || p_agent,0));
  SELECT a.* INTO v_previous FROM public.agent_presence a WHERE a.share_id=p_share AND a.agent_id=p_agent;
  INSERT INTO public.agent_presence(share_id,agent_id,status,summary,last_seen_at) VALUES(p_share,p_agent,p_status,p_summary,now())
    ON CONFLICT(share_id,agent_id) DO UPDATE SET status=EXCLUDED.status,summary=EXCLUDED.summary,last_seen_at=EXCLUDED.last_seen_at;
  IF v_previous.agent_id IS NULL OR v_previous.status IS DISTINCT FROM p_status OR v_previous.summary IS DISTINCT FROM p_summary THEN
    INSERT INTO public.feedback_events(share_id,actor_type,actor_id,event_type,payload)
      VALUES(p_share,'agent',p_agent,'presence.updated',jsonb_build_object('status',p_status,'summary',p_summary));
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_agent_events(uuid,text,bigint,integer), public.write_agent_presence(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_agent_events(uuid,text,bigint,integer), public.write_agent_presence(uuid,text,text,text,text) TO service_role;
`

// A durable outbound fence survives timeouts and uncertain provider results.
export const projectPrivacyDispatchSql = `
CREATE FUNCTION public.tracker_dispatch_pending(p_project text)
RETURNS boolean LANGUAGE sql SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.comments c WHERE c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.project_id=p_project AND w.state='creating' AND w.uncertain_at IS NOT NULL);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_project_privacy_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.widget_private AND (NEW.widget_private IS DISTINCT FROM OLD.widget_private OR NEW.feedback_access IS DISTINCT FROM OLD.feedback_access)
    AND public.tracker_dispatch_pending(NEW.public_key) THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF NEW.widget_private AND NEW.feedback_access='admins' AND EXISTS(
    SELECT 1 FROM public.comment_email_batches b JOIN public.comments c ON c.id=b.delivery_id
    WHERE c.project_id=NEW.public_key AND b.status='pending' AND b.lease_token IS NOT NULL
  ) THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fence_comment_delivery_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.github_issue_number IS NULL AND OLD.github_issue_uncertain_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.comment_external_work w WHERE w.comment_id=OLD.id AND w.state='creating' AND w.uncertain_at IS NOT NULL)
    THEN RAISE EXCEPTION 'tracker_dispatch_in_progress'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_email_batches b WHERE b.delivery_id=OLD.id AND b.status='pending' AND b.lease_token IS NOT NULL)
    THEN RAISE EXCEPTION 'feedback_delivery_in_progress'; END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.begin_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_feedback_actor(p_project,p_actor,'integrations:send');
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project AND c.status IN ('pending','approved') FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_work IS NULL THEN
    IF NOT public.mark_comment_github_issue_uncertain(p_comment,p_project,p_lease) THEN RETURN false; END IF;
    UPDATE public.comments SET github_issue_lease_expires_at='infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease;
    RETURN true;
  END IF;
  UPDATE public.comment_external_work w SET uncertain_at=now(),lease_expires_at='infinity'::timestamptz,updated_at=now()
    WHERE w.id=p_work AND w.comment_id=p_comment AND w.project_id=p_project AND w.state='creating'
      AND w.lease_token=p_lease AND w.uncertain_at IS NULL AND w.lease_expires_at>clock_timestamp();
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tracker_dispatch_pending(text),public.begin_actor_tracker_dispatch(text,uuid,uuid,uuid,uuid) TO service_role;
`

export const projectPrivacyEventSql = `
CREATE FUNCTION public.guard_share_comment_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE; v_project text; v_private boolean;
BEGIN
  IF NEW.comment_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.project_id INTO v_project FROM public.feedback_shares s WHERE s.id=NEW.share_id;
  SELECT p.widget_private INTO v_private FROM public.projects p WHERE p.public_key=v_project FOR SHARE;
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=NEW.share_id FOR SHARE;
  IF NOT FOUND OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=clock_timestamp()
    OR (v_share.created_by='system' AND v_private) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.comments c WHERE c.id=NEW.comment_id AND c.project_id=v_project AND c.visibility='shared' AND c.status='approved'
    AND (v_share.scope_type <> 'page' OR c.url=v_share.scope_page_url) FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_share.scope_type <> 'project' THEN
    PERFORM 1 FROM public.feedback_share_items i WHERE i.share_id=NEW.share_id AND i.comment_id=NEW.comment_id FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_share_comment_event BEFORE INSERT ON public.feedback_events FOR EACH ROW EXECUTE FUNCTION public.guard_share_comment_event();
--> statement-breakpoint
CREATE FUNCTION public.read_agent_operation_key(p_share uuid,p_token_hash text,p_agent text,p_key text)
RETURNS SETOF public.feedback_operation_keys LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.lock_agent_share(p_share,p_token_hash);
  RETURN QUERY SELECT k.* FROM public.feedback_operation_keys k WHERE k.share_id=p_share AND k.agent_id=p_agent AND k.idempotency_key=p_key;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_share_comment_event(),public.read_agent_operation_key(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_agent_operation_key(uuid,text,text,text) TO service_role;
`

// Expand/contract: preserve legacy RPCs; only the new app calls the v2 contract.
// Infinite active leases fence legacy claimers too, until exact-sender completion.
export const projectPrivacyRecoverySql = `
CREATE FUNCTION public.claim_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_lease_seconds integer,
	p_recovery boolean DEFAULT false
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	RETURN QUERY
	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = p_lease_token,
		github_issue_lease_expires_at = CASE WHEN p_recovery THEN 'infinity'::timestamptz ELSE now() + make_interval(
			secs => least(greatest(p_lease_seconds, 30), 900)
		) END
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status IN ('pending', 'approved')
		AND comment.github_issue_number IS NULL
		AND (
			(p_recovery AND comment.github_issue_uncertain_at IS NOT NULL AND (comment.github_issue_lease_token IS NULL OR comment.github_issue_lease_expires_at = '-infinity'::timestamptz))
			OR
			(NOT p_recovery AND comment.github_issue_uncertain_at IS NULL)
		)
		AND (
			comment.github_issue_lease_token IS NULL
			OR comment.github_issue_lease_expires_at <= now()
		)
	RETURNING comment.*;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.release_comment_github_issue_v2(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_updated integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL AND comment.github_issue_uncertain_at IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_comment_github_issue_v2(uuid,text,uuid,integer,boolean),public.release_comment_github_issue_v2(uuid,text,uuid) TO service_role;
--> statement-breakpoint
-- Negative infinity is a durable acknowledgment that this exact sender callback settled.
-- Expired leases and absent coordination sessions are deliberately not acknowledgments.
CREATE FUNCTION public.acknowledge_tracker_dispatch_stopped(p_project text,p_comment uuid,p_lease uuid,p_work uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE public_key=p_project FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments WHERE id=p_comment AND project_id=p_project FOR UPDATE;
  IF p_work IS NULL THEN
    UPDATE public.comments SET github_issue_lease_expires_at='-infinity'::timestamptz
      WHERE id=p_comment AND project_id=p_project AND github_issue_lease_token=p_lease
        AND github_issue_number IS NULL AND github_issue_uncertain_at IS NOT NULL;
  ELSE
    UPDATE public.comment_external_work SET lease_expires_at='-infinity'::timestamptz,updated_at=now()
      WHERE id=p_work AND project_id=p_project AND comment_id=p_comment AND lease_token=p_lease
        AND state='creating' AND uncertain_at IS NOT NULL;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acknowledge_tracker_dispatch_stopped(text,uuid,uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.resolve_actor_tracker_dispatch(p_project text,p_actor uuid,p_comment uuid,p_provider text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('crrt-tracker-dispatch:' || p_project,0)) THEN RAISE EXCEPTION 'tracker_dispatch_active'; END IF;
  IF public.lock_feedback_actor(p_project,p_actor,'integrations:send') <> 'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project,0));
  PERFORM 1 FROM public.comments c WHERE c.id=p_comment AND c.project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='github' THEN
    IF EXISTS(SELECT 1 FROM public.comments WHERE id=p_comment AND project_id=p_project AND github_issue_uncertain_at IS NOT NULL AND github_issue_lease_token IS NOT NULL AND github_issue_lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
    UPDATE public.comments c SET github_issue_uncertain_at=NULL,github_issue_lease_token=NULL,github_issue_lease_expires_at=NULL
      WHERE c.id=p_comment AND c.project_id=p_project AND c.github_issue_number IS NULL AND c.github_issue_uncertain_at IS NOT NULL;
    RETURN FOUND;
  END IF;
  IF p_provider NOT IN ('linear','jira') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  IF EXISTS(SELECT 1 FROM public.comment_external_work WHERE project_id=p_project AND comment_id=p_comment AND provider=p_provider AND state='creating' AND uncertain_at IS NOT NULL AND lease_expires_at IS DISTINCT FROM '-infinity'::timestamptz) THEN RAISE EXCEPTION 'tracker_dispatch_unconfirmed'; END IF;
  DELETE FROM public.comment_external_work w WHERE w.project_id=p_project AND w.comment_id=p_comment AND w.provider=p_provider
    AND w.state='creating' AND w.uncertain_at IS NOT NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_actor_tracker_dispatch(text,uuid,uuid,text) TO service_role;
`

// Restore the pre-0032 service RPC contract for already-migrated environments.
export const projectPrivacyLegacyRecoverySql = `
CREATE OR REPLACE FUNCTION public.claim_comment_github_issue(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid,
	p_lease_seconds integer,
	p_recovery boolean DEFAULT false
)
RETURNS SETOF public.comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	RETURN QUERY
	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = p_lease_token,
		github_issue_lease_expires_at = now() + make_interval(
			secs => least(greatest(p_lease_seconds, 30), 900)
		)
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.status IN ('pending', 'approved')
		AND comment.github_issue_number IS NULL
		AND (
			(p_recovery AND comment.github_issue_uncertain_at IS NOT NULL)
			OR
			(NOT p_recovery AND comment.github_issue_uncertain_at IS NULL)
		)
		AND (
			comment.github_issue_lease_token IS NULL
			OR comment.github_issue_lease_expires_at <= now()
		)
	RETURNING comment.*;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.release_comment_github_issue(
	p_comment_id uuid,
	p_project_key text,
	p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_updated integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || p_project_key, 0));

	UPDATE public.comments AS comment
	SET
		github_issue_lease_token = NULL,
		github_issue_lease_expires_at = NULL
	WHERE comment.id = p_comment_id
		AND comment.project_id = p_project_key
		AND comment.github_issue_lease_token = p_lease_token
		AND comment.github_issue_number IS NULL;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated = 1;
END;
$$;
`
