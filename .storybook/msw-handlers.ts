import { http, HttpResponse } from 'msw'
import type { BillingSummary, Project } from '../apps/dashboard/api'

// Reserved test domain keeps stories separate from the deployed API.
export const apiBase = 'https://storybook.crrt.test/api'
export const project: Project = {
  publicKey: 'storybook-project',
  slug: 'storybook-project',
  name: 'Storybook project',
  allowedOrigins: [],
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  role: 'owner',
  widgetPrivate: false,
  feedbackAccess: 'team',
}

export const billingSummary: BillingSummary = {
  enabled: true,
  testMode: true,
  plan: 'pro',
  lifecycle: 'active',
  currentPeriodEnd: '2026-11-01T12:00:00Z',
  allowed: { manageBilling: true },
  usage: {
    projects: { used: 2, limit: 5, resetAt: null },
    internalUsers: { used: 3, limit: 5, resetAt: null },
    comments: { used: 42, limit: 1000, resetAt: null },
    productAudits: { used: 1, limit: 10, resetAt: null },
  },
}

export const mswHandlers = [
  http.get(`${apiBase}/v1/billing`, () => HttpResponse.json(billingSummary)),
  http.patch(`${apiBase}/v1/projects/${project.publicKey}`, async ({ request }) => {
    const settings = await request.json() as Pick<Project, 'widgetPrivate' | 'feedbackAccess'>
    return HttpResponse.json({ ...project, ...settings })
  }),
]
