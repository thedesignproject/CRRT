import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  jsonb,
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
  claimable: boolean('claimable').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// userId / invitedBy reference auth.users(id). Drizzle can't model the auth
// schema, so the FK is added in the migration SQL by hand (see DRIZZLE-GUIDE.md).
export const projectMembers = pgTable(
  'project_members',
  {
    projectKey: text('project_key')
      .notNull()
      .references(() => projects.publicKey, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectKey, t.userId] }),
    userIdx: index('project_members_user_id_idx').on(t.userId),
    roleCheck: check('project_members_role_check', sql`${t.role} in ('admin', 'member')`),
  }),
)

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
    roleCheck: check('project_invites_role_check', sql`${t.role} in ('admin', 'member')`),
    emailLowerCheck: check('project_invites_email_lower_check', sql`${t.email} = lower(${t.email})`),
  }),
)

export const projectRepoConfigs = pgTable('project_repo_configs', {
  projectKey: text('project_key')
    .primaryKey()
    .references(() => projects.publicKey, { onDelete: 'cascade' }),
  repoUrl: text('repo_url'),
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

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: text('project_id'),
    url: text('url'),
    x: doublePrecision('x'),
    y: doublePrecision('y'),
    element: text('element'),
    comment: text('comment'),
    status: text('status').default('pending'),
    implementationStatus: text('implementation_status').default('unassigned'),
    claimedByAgentId: text('claimed_by_agent_id'),
    createdBy: text('created_by').default('public'),
    imageUrl: text('image_url'),
    authorName: text('author_name'),
    // 'element_point' (click-to-pin) or 'text_range' (anchored to selected text)
    targetType: text('target_type').default('element_point'),
    // TextRangeAnchor JSON for text_range comments; null means no anchor
    anchor: jsonb('anchor'),
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
    kindCheck: check(
      'notifications_kind_check',
      sql`${t.kind} in ('invite.received', 'invite.accepted', 'invite.declined')`,
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
