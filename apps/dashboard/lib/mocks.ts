import type { AdminPage, AdminProject, AdminProjectSort, AdminStats, AdminUser, AgentRun, BrainRule, CommentRecord, NextStepRecord, Project } from '../api'

// VITE_USE_MOCKS:
//   '1'     → populated fixtures (default mock mode)
//   'empty' → empty account, useful for previewing the onboarding flow
//   'onboarding' → existing project with no feedback, useful for the install demo
//   unset   → real API
const mockMode = import.meta.env.VITE_USE_MOCKS
export const mocksEnabled = mockMode === '1' || mockMode === 'empty' || mockMode === 'onboarding'
export const mocksEmpty = mockMode === 'empty'
export const mocksOnboarding = mockMode === 'onboarding'

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString()

export const MOCK_PROJECTS: Project[] = [
  {
    publicKey: 'proj_acme_marketing',
    slug: 'acme-marketing',
    name: 'Acme Marketing Site',
    allowedOrigins: ['acme.com'],
    createdAt: ago(60 * 24 * 14),
    updatedAt: ago(15),
    openCount: 3,
    agentLive: true,
  },
  {
    publicKey: 'proj_dashboard_v2',
    slug: 'dashboard-v2',
    name: 'Internal Dashboard v2',
    allowedOrigins: [],
    createdAt: ago(60 * 24 * 5),
    updatedAt: ago(120),
    openCount: 1,
  },
]

const PROJECT_COMMENTS: Record<string, CommentRecord[]> = {
  proj_acme_marketing: [
    {
      id: 'cmt_01',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/pricing',
      selector: 'section.hero > h1',
      x: 320,
      y: 180,
      body: 'El headline está muy largo en mobile, se corta. Probemos algo más corto o reducir tamaño en breakpoint sm.',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'María González',
      createdAt: ago(8),
      updatedAt: ago(8),
    },
    {
      id: 'cmt_02',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/pricing',
      selector: 'button.cta-primary',
      x: 540,
      y: 420,
      body: 'El contraste del CTA contra el fondo no pasa AA. Subir a un naranja más saturado.',
      reviewStatus: 'accepted',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'Pranav Sunil',
      createdAt: ago(35),
      updatedAt: ago(20),
    },
    {
      id: 'cmt_03',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/',
      selector: 'nav a[href="/docs"]',
      x: 880,
      y: 48,
      body: 'Link a docs apunta a 404. Repuntar a /documentation.',
      reviewStatus: 'accepted',
      implementationStatus: 'done',
      claimedByAgentId: 'claude-code',
      imageUrl: null,
      authorName: 'Tomás Osses',
      createdAt: ago(60 * 6),
      updatedAt: ago(60 * 2),
    },
    {
      id: 'cmt_06',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/pricing',
      selector: 'section.plans > p.disclaimer',
      x: 412,
      y: 980,
      body: 'Esta frase suena legalista. Cambiar por algo más simple, tipo "puedes cancelar cuando quieras".',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'María González',
      targetType: 'text_range',
      anchor: {
        kind: 'text_range',
        selectedText: 'sujeto a los términos y condiciones vigentes',
        normalizedText: 'sujeto a los términos y condiciones vigentes',
        prefix: 'El plan puede cancelarse ',
        suffix: ' al momento de la compra.',
        containerSelector: 'section.plans > p.disclaimer',
        startOffset: 25,
        endOffset: 69,
        createdFromUrl: 'https://acme.test/pricing',
      },
      createdAt: ago(15),
      updatedAt: ago(15),
    },
    {
      id: 'cmt_04',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/blog',
      selector: 'article.post:nth-child(1)',
      x: 240,
      y: 760,
      body: 'Falta fecha de publicación visible en el card.',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'María González',
      createdAt: ago(90),
      updatedAt: ago(90),
    },
    {
      id: 'cmt_05',
      projectId: 'proj_acme_marketing',
      pageUrl: 'https://acme.test/pricing',
      selector: 'div.plan-card[data-plan="pro"]',
      x: 720,
      y: 580,
      body: 'Mostrar precio mensual y anual con toggle, no separados.',
      reviewStatus: 'rejected',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'Pranav Sunil',
      createdAt: ago(60 * 24),
      updatedAt: ago(60 * 12),
    },
  ],
  proj_dashboard_v2: [
    {
      id: 'cmt_10',
      projectId: 'proj_dashboard_v2',
      pageUrl: 'https://dash.internal/overview',
      selector: 'aside.sidebar',
      x: 80,
      y: 200,
      body: 'Sidebar debería colapsar con ⌘. también, no solo S.',
      reviewStatus: 'accepted',
      implementationStatus: 'in_progress',
      claimedByAgentId: 'claude-code',
      imageUrl: null,
      authorName: 'Tomás Osses',
      createdAt: ago(45),
      updatedAt: ago(10),
    },
    {
      id: 'cmt_11',
      projectId: 'proj_dashboard_v2',
      pageUrl: 'https://dash.internal/overview',
      selector: 'table.activity-feed',
      x: 600,
      y: 340,
      body: 'Timestamps en UTC, deberían ser relativos ("2m ago").',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'Pranav Sunil',
      createdAt: ago(180),
      updatedAt: ago(180),
    },
  ],
}

export function getMockProjects(): Project[] {
  if (mocksEmpty) return []
  return MOCK_PROJECTS
}

export function getMockComments(projectId: string): CommentRecord[] {
  if (mocksEmpty || mocksOnboarding) return []
  return PROJECT_COMMENTS[projectId] ?? []
}

export const MOCK_WORKSPACE_NAME = 'Acme Studio'

const MOCK_RULES: BrainRule[] = [
  { id: 'rule_headlines', title: 'Keep headlines under 8 words', body: 'Marketing headlines must read at a glance on a phone.', projectKey: null, createdAt: ago(60 * 24 * 3), updatedAt: ago(60 * 24 * 3), mine: true, citations: 4 },
  { id: 'rule_contrast', title: 'Buttons pass AA contrast', body: 'Button text keeps at least 4.5:1 contrast against its background.', projectKey: 'proj_acme_marketing', createdAt: ago(60 * 24), updatedAt: ago(60 * 24), mine: false, citations: 1 },
]

export function getMockRules(): BrainRule[] {
  return mocksEmpty ? [] : MOCK_RULES
}

const MOCK_NEXT_STEPS: Record<string, NextStepRecord[]> = {
  proj_acme_marketing: [{
    id: 'step_cta', title: 'Raise the CTA contrast', tag: 'design', status: 'paused', createdAt: ago(20),
    comments: [{ id: 'cmt_02', body: 'El contraste del CTA contra el fondo no pasa AA. Subir a un naranja más saturado.', authorName: 'Pranav Sunil' }],
    requesters: ['Pranav Sunil'],
    citations: [{ ruleId: 'rule_contrast', title: 'Buttons pass AA contrast' }],
    conflict: { ruleId: 'rule_contrast', ruleTitle: 'Buttons pass AA contrast', question: 'The saturated orange only reaches 3.9:1. Keep the AA rule and pick a darker shade, or update the rule?', decision: null },
  }],
}

// The page shows only steps whose comments are ready, so empty modes need no branch here.
export function getMockNextSteps(projectId: string): NextStepRecord[] {
  return MOCK_NEXT_STEPS[projectId] ?? []
}

const MOCK_RUNS: AgentRun[] = [
  { id: 'share_2:codex', projectKey: 'proj_acme_marketing', agentLabel: 'codex', startedAt: ago(60 * 3), endedAt: ago(60 * 3 - 12), steps: 5, commentsCompleted: 0, outcome: 'blocked' },
  { id: 'share_1:claude-code', projectKey: 'proj_acme_marketing', agentLabel: 'claude-code', startedAt: ago(60 * 26), endedAt: ago(60 * 25), steps: 14, commentsCompleted: 3, outcome: 'completed' },
]

export function getMockAgentRuns(projectId: string): AgentRun[] {
  return MOCK_RUNS.filter((run) => run.projectKey === projectId)
}

const ADMIN_NAMES = ['Tomas', 'Pranav', 'Dianne', 'Lara', 'Agustin', 'Cris', 'Alessandro', 'María']
const ADMIN_DOMAINS = ['tdp.studio', 'client.dev', 'agency.local']

export const MOCK_ADMIN_STATS: AdminStats = {
  accounts: 86,
  projects: 34,
  comments: 418,
  shares: 47,
  activeAgentPresence: 3,
  signups: { last24Hours: 4, last7Days: 19, last30Days: 62 },
}

export const MOCK_ADMIN_USERS: AdminUser[] = Array.from({ length: 86 }, (_, i) => {
  const name = ADMIN_NAMES[i % ADMIN_NAMES.length]
  const email = `${name.toLowerCase()}${i + 1}@${ADMIN_DOMAINS[i % ADMIN_DOMAINS.length]}`
  return {
    id: `user_${String(i + 1).padStart(3, '0')}`,
    email,
    createdAt: ago(60 * 24 * (i + 1)),
    lastSignInAt: i % 5 === 0 ? null : ago(45 + i * 18),
    emailConfirmedAt: i % 7 === 0 ? null : ago(60 * 24 * i),
    projectsAsAdminCount: i % 4,
    projectsAsMemberCount: (i + 2) % 6,
    superAdmin: i < 3,
  }
})

export const MOCK_ADMIN_PROJECTS: AdminProject[] = Array.from({ length: 34 }, (_, i) => {
  const comments = 4 + ((i * 11) % 64)
  const accepted = Math.floor(comments * 0.38)
  const rejected = Math.floor(comments * 0.12)
  const pending = comments - accepted - rejected
  const done = Math.floor(accepted * 0.42)
  const inProgress = Math.floor(accepted * 0.18)
  const claimed = Math.floor(accepted * 0.12)
  const blocked = i % 9 === 0 ? 1 : 0
  const readyForTesting = Math.floor(accepted * 0.15)
  const unassigned = Math.max(0, comments - done - inProgress - claimed - blocked - readyForTesting)
  const owner = MOCK_ADMIN_USERS[i % MOCK_ADMIN_USERS.length]
  const member = MOCK_ADMIN_USERS[(i + 7) % MOCK_ADMIN_USERS.length]
  return {
    publicKey: `proj_${String(i + 1).padStart(2, '0')}_crrt`,
    name: `CRRT Client ${i + 1}`,
    createdAt: ago(60 * 24 * (i + 3)),
    commentCount: comments,
    commentStatusCounts: { pending, accepted, rejected },
    implementationStatusCounts: { unassigned, claimed, inProgress, blocked, readyForTesting, done },
    feedbackShareCount: 1 + (i % 9),
    commentedUrlCount: 1 + (i % 12),
    firstCommentAt: ago(60 * 24 * (i + 12)),
    lastCommentAt: ago(25 + i * 21),
    claimed: i % 3 !== 0,
    members: [
      { email: owner.email ?? owner.id, role: 'admin' },
      { email: member.email ?? member.id, role: 'member' },
    ],
  }
})

function page<T>(items: T[], cursor?: string | null, limit = 50): AdminPage<T> {
  const start = cursor ? Number(cursor) : 0
  const end = start + limit
  return {
    items: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null,
    hasMore: end < items.length,
  }
}

export function getMockAdminStats(): AdminStats {
  return mocksEmpty
    ? { accounts: 0, projects: 0, comments: 0, shares: 0, activeAgentPresence: 0, signups: { last24Hours: 0, last7Days: 0, last30Days: 0 } }
    : MOCK_ADMIN_STATS
}

export function getMockAdminUsersPage(opts: { cursor?: string | null; limit?: number } = {}) {
  return page(mocksEmpty ? [] : MOCK_ADMIN_USERS, opts.cursor, opts.limit)
}

export function getMockAdminProjectsPage(opts: {
  cursor?: string | null
  limit?: number
  sort?: AdminProjectSort
  direction?: 'asc' | 'desc'
} = {}) {
  const sort = opts.sort ?? 'lastCommentAt'
  const direction = opts.direction ?? 'desc'
  const sorted = [...(mocksEmpty ? [] : MOCK_ADMIN_PROJECTS)].sort((a, b) => {
    const av = a[sort]
    const bv = b[sort]
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return direction === 'asc' ? cmp : -cmp
  })
  return page(sorted, opts.cursor, opts.limit)
}
