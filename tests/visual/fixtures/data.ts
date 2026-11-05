export const fixedTime = '2026-11-04T12:00:00.000Z'
export const project = { publicKey: 'proj_acme_marketing', slug: 'acme-marketing', name: 'Acme Marketing Site', allowedOrigins: ['example.test'], role: 'owner', createdAt: fixedTime, updatedAt: fixedTime }
export const comments = [
  { id: 'visual-1', projectId: project.publicKey, selector: '#target-heading', x: 20, y: 6, body: 'Make the heading easier to read on narrow screens.', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, authorName: 'Pranav Sunil', createdAt: fixedTime, updatedAt: fixedTime, imageUrl: null, editable: true },
  { id: 'visual-2', projectId: project.publicKey, selector: '#target-button', x: 20, y: 18, body: 'Increase contrast on this action.', reviewStatus: 'accepted', implementationStatus: 'done', claimedByAgentId: 'codex', authorName: 'María González', createdAt: fixedTime, updatedAt: fixedTime, imageUrl: null, editable: true },
  { id: 'visual-3', projectId: project.publicKey, selector: '#target-copy', x: 20, y: 11, body: 'Keep this sentence short and direct.', reviewStatus: 'rejected', implementationStatus: 'blocked', claimedByAgentId: null, authorName: 'Reviewer', createdAt: fixedTime, updatedAt: fixedTime, imageUrl: null, editable: false },
]
export const billing = {
  enabled: true, testMode: true, deployment: 'cloud', plan: null, lifecycle: 'none', cancelAtPeriodEnd: false,
  canManageSubscription: false, allowed: { manageBilling: true },
  plans: [
    { key: 'pro', name: 'Pro', hosting: 'cloud', monthlyPriceUsd: 19, trialDays: 14, limits: { projects: 10, internalUsers: 10, commentsPerMonth: 2000, auditsPerMonth: 5, guests: null } },
    { key: 'studio', name: 'Studio', hosting: 'cloud', monthlyPriceUsd: 49, trialDays: 14, limits: { projects: 50, internalUsers: 25, commentsPerMonth: 10000, auditsPerMonth: 30, guests: null } },
  ],
  planPrices: { pro: { amount: '$19', interval: 'month' }, studio: { amount: '$49', interval: 'month' } },
  usage: { projects: { used: 2, limit: 10, resetAt: null }, internalUsers: { used: 3, limit: 10, resetAt: null }, comments: { used: 300, limit: 2000, resetAt: null }, productAudits: { used: 1, limit: 5, resetAt: null } },
}
