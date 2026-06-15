import type { CommentRecord, Project } from '../api'

// VITE_USE_MOCKS:
//   '1'     → populated fixtures (default mock mode)
//   'empty' → empty account, useful for previewing the onboarding flow
//   unset   → real API
export const mocksEnabled = import.meta.env.VITE_USE_MOCKS === '1' || import.meta.env.VITE_USE_MOCKS === 'empty'
export const mocksEmpty = import.meta.env.VITE_USE_MOCKS === 'empty'

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
  },
  {
    publicKey: 'proj_dashboard_v2',
    slug: 'dashboard-v2',
    name: 'Internal Dashboard v2',
    allowedOrigins: [],
    createdAt: ago(60 * 24 * 5),
    updatedAt: ago(120),
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
  if (mocksEmpty) return []
  return PROJECT_COMMENTS[projectId] ?? []
}
