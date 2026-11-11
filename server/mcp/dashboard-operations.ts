import type { VercelRequest, VercelResponse } from '@vercel/node'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
export type DashboardOperation = {
  name: string
  description: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query: readonly string[]
  required: readonly string[]
  body: string
  readOnly?: boolean
  load: () => Promise<{ default: Handler }>
}
const operation = (name: string, description: string, method: DashboardOperation['method'], query: readonly string[], required: readonly string[], body: string, load: DashboardOperation['load']): DashboardOperation => ({ name, description, method, query, required, body, load, readOnly: method === 'GET' || name === 'recordings.agent_payload' })

// This is an allowlist, not an HTTP proxy. Callers cannot supply a route, method,
// headers, actor, or import path. Each handler keeps its existing validation,
// actor/role checks, plan gates and side effects.
export const dashboardOperations: DashboardOperation[] = [
  operation('projects.list', 'List your projects and effective dashboard capabilities.', 'GET', [], [], '', () => import('../../api/v1/projects/index.js')),
  operation('projects.availability', 'Check a proposed public project key.', 'GET', ['key'], ['key'], '', () => import('../../api/v1/projects/availability.js')),
  operation('projects.claim', 'Create or claim a project using its public key.', 'POST', [], [], '{projectKey, name?}', () => import('../../api/v1/projects/claim.js')),
  operation('projects.update', 'Rename or change allowed origins, privacy and feedback access.', 'PATCH', ['projectId'], ['projectId'], '{name?, allowedOrigins?: string[], widgetPrivate?: boolean, feedbackAccess?: "team"|"admins"}', () => import('../../api/v1/projects/[projectId]/index.js')),
  operation('projects.export', 'Export authorized project feedback. Large exports may require narrower feedback reads.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/export.js')),
  operation('projects.suggestions', 'Find projects matching your verified email domain.', 'GET', [], [], '', () => import('../../api/v1/projects/suggestions.js')),
  operation('feedback.list', 'Read project feedback using dashboard visibility rules.', 'GET', ['projectId', 'pageUrl', 'reviewStatus', 'implementationStatus'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/comments.js')),
  operation('feedback.visibility', 'Change feedback visibility.', 'PATCH', ['commentId'], ['commentId'], '{visibility: "shared"|"internal"}', () => import('../../api/v1/comments/[commentId]/visibility.js')),
  operation('feedback.review', 'Explicit human review decision, with optional compare-and-set and undo.', 'PATCH', ['commentId'], ['commentId'], '{reviewStatus: "open"|"accepted"|"rejected", expectedUpdatedAt?, implementationStatus?, captureUndo?, preserveExternalWork?, undoToken?}', () => import('../../api/v1/comments/[commentId]/review-status.js')),
  operation('feedback.implementation', 'Set implementation status as explicitly requested by the user.', 'PATCH', ['commentId'], ['commentId'], '{implementationStatus: "unassigned"|"claimed"|"in_progress"|"blocked"|"ready_for_testing"|"done"}', () => import('../../api/v1/comments/[commentId]/implementation-status.js')),
  operation('inbox.list', 'List your captured extension feedback.', 'GET', ['page', 'limit'], [], '', () => import('../../api/v1/extension/comments/index.js')),
  operation('inbox.update', 'Edit or assign captured feedback.', 'PATCH', ['commentId'], ['commentId'], '{body?: string, projectId?: string, visibility?: "shared"|"internal"}', () => import('../../api/v1/extension/comments/[commentId].js')),
  operation('inbox.delete', 'Delete captured feedback.', 'DELETE', ['commentId'], ['commentId'], '', () => import('../../api/v1/extension/comments/[commentId].js')),
  operation('inbox.bulk', 'Bulk assign or delete captured feedback using dashboard limits.', 'POST', [], [], '{operation: "assign"|"delete", selection, projectId?, visibility?, captureUndo?}', () => import('../../api/v1/extension/comments/bulk.js')),
  operation('inbox.restore', 'Restore previously deleted inbox feedback with its undo versions.', 'POST', [], [], '{projectId, items: [{id, updatedAt}]}', () => import('../../api/v1/extension/comments/restore.js')),
  operation('repository.read', 'Read repository configuration and project instructions.', 'GET', ['projectId', 'view'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/repo-config.js')),
  operation('repository.update', 'Update instructions/commands OR connect/disconnect a verified repository. Never combine both.', 'PATCH', ['projectId'], ['projectId'], '{agentInstructions?, localPath?, devCommand?, testCommand?} OR {repoUrl: string|null, installationToken?: string}', () => import('../../api/v1/projects/[projectId]/repo-config.js')),
  operation('repository.completion', 'Read GitHub browser verification using the flowId returned by repository.installations; then select a verified repository with repository.update.', 'GET', ['projectId', 'flowId'], ['projectId', 'flowId'], '', () => import('../../api/v1/projects/[projectId]/github/completion.js')),
  operation('repository.installations', 'Get available GitHub installations or the browser installation URL.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/github/install.js')),
  operation('members.list', 'List project members.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/members.js')),
  operation('members.role', 'Change a project member role using existing owner/admin rules.', 'PATCH', ['projectId', 'userId'], ['projectId', 'userId'], '{role: "owner"|"admin"|"member"|"guest"}', () => import('../../api/v1/projects/[projectId]/members/[userId].js')),
  operation('members.remove', 'Remove a member using existing owner/admin rules.', 'DELETE', ['projectId', 'userId'], ['projectId', 'userId'], '', () => import('../../api/v1/projects/[projectId]/members/[userId].js')),
  operation('invites.list_project', 'List project invitations.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/invites.js')),
  operation('invites.send', 'Invite a user to a project; sends the normal invitation email.', 'POST', ['projectId'], ['projectId'], '{email, role?: "admin"|"member"|"guest"}', () => import('../../api/v1/projects/[projectId]/invites.js')),
  operation('invites.cancel', 'Cancel a project invitation.', 'DELETE', ['projectId', 'email'], ['projectId', 'email'], '', () => import('../../api/v1/projects/[projectId]/invites.js')),
  operation('invites.list_received', 'List invitations addressed to you.', 'GET', [], [], '', () => import('../../api/v1/invites/index.js')),
  operation('invites.accept', 'Accept your invitation.', 'POST', [], [], '{projectKey}', () => import('../../api/v1/invites/accept.js')),
  operation('invites.decline', 'Decline your invitation.', 'POST', [], [], '{projectKey}', () => import('../../api/v1/invites/decline.js')),
  operation('domains.list', 'List project email domains.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/email-domains.js')),
  operation('domains.add', 'Add a project email domain.', 'POST', ['projectId'], ['projectId'], '{domain}', () => import('../../api/v1/projects/[projectId]/email-domains.js')),
  operation('domains.remove', 'Remove a project email domain.', 'DELETE', ['projectId', 'domain'], ['projectId', 'domain'], '', () => import('../../api/v1/projects/[projectId]/email-domains.js')),
  operation('access.list_requests', 'List access requests for a project.', 'GET', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/access-requests/index.js')),
  operation('access.request', 'Request access to a project.', 'POST', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/access-requests/index.js')),
  operation('access.decide', 'Approve or decline an access request.', 'PATCH', ['projectId', 'requestId'], ['projectId', 'requestId'], '{decision: "approved"|"declined", role: "admin"|"member"|"guest", attempt: number}', () => import('../../api/v1/projects/[projectId]/access-requests/[requestId].js')),
  operation('external_work.draft', 'Read an external-work draft and existing linked work.', 'GET', ['commentId', 'provider'], ['commentId'], '', () => import('../../api/v1/comments/[commentId]/external-work.js')),
  operation('external_work.send', 'Send feedback to GitHub, Linear or Jira. Reuses the existing dispatch deduplication.', 'POST', ['commentId'], ['commentId'], '{provider: "github"|"linear"|"jira", draft: {title, body}}', () => import('../../api/v1/comments/[commentId]/external-work.js')),
  operation('external_work.retry', 'Retry synchronization of linked external work.', 'POST', ['commentId'], ['commentId'], '', () => import('../../api/v1/comments/[commentId]/external-work-sync.js')),
  operation('external_work.recover', 'Resolve a pending external dispatch using its provider recovery flow.', 'POST', ['commentId'], ['commentId'], '{provider: "github"|"linear"|"jira", confirmCheckedTracker: true}', () => import('../../api/v1/comments/[commentId]/external-work-recovery.js')),
  operation('linear.read', 'Read Linear integration or request its browser OAuth URL with action=authorize.', 'GET', ['projectId', 'action'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/integrations/linear.js')),
  operation('linear.select', 'Select the connected Linear team.', 'PATCH', ['projectId'], ['projectId'], '{containerId}', () => import('../../api/v1/projects/[projectId]/integrations/linear.js')),
  operation('linear.disconnect', 'Disconnect Linear.', 'DELETE', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/integrations/linear.js')),
  operation('jira.read', 'Read Jira integration or request its browser OAuth URL with action=authorize.', 'GET', ['projectId', 'action'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/integrations/jira.js')),
  operation('jira.select', 'Select the connected Jira project.', 'PATCH', ['projectId'], ['projectId'], '{containerId}', () => import('../../api/v1/projects/[projectId]/integrations/jira.js')),
  operation('jira.disconnect', 'Disconnect Jira.', 'DELETE', ['projectId'], ['projectId'], '', () => import('../../api/v1/projects/[projectId]/integrations/jira.js')),
  operation('storybook.read', 'Read Storybook integration.', 'GET', ['projectKey'], ['projectKey'], '', () => import('../../api/v1/storybook/connections/index.js')),
  operation('storybook.disconnect', 'Disconnect Storybook.', 'DELETE', ['projectKey', 'connectionId'], ['projectKey', 'connectionId'], '', () => import('../../api/v1/storybook/connections/index.js')),
  operation('storybook.pair', 'Create a short-lived Storybook pairing code.', 'POST', [], [], '{projectKey}', () => import('../../api/v1/storybook/pairings/index.js')),
  operation('shares.create', 'Create a feedback handoff share using dashboard authorization. Returned share links are capabilities; do not publish them.', 'POST', [], [], '{projectId, scopeType, pageUrl?, commentIds?}', () => import('../../api/v1/feedback-shares/index.js')),
  operation('shares.prompt', 'Read a prompt for your authorized share.', 'GET', ['shareId', 'target'], ['shareId'], '', () => import('../../api/v1/feedback-shares/[shareId]/prompt.js')),
  operation('notifications.list', 'List your notifications.', 'GET', ['unreadOnly'], [], '', () => import('../../api/v1/notifications/index.js')),
  operation('notifications.read', 'Mark one notification read.', 'POST', ['notificationId'], ['notificationId'], '', () => import('../../api/v1/notifications/[notificationId]/read.js')),
  operation('notifications.read_all', 'Mark all your notifications read.', 'POST', [], [], '', () => import('../../api/v1/notifications/read-all.js')),
  operation('recordings.capabilities', 'Read Record availability and limits.', 'GET', [], [], '', () => import('../../api/v1/recordings/capabilities.js')),
  operation('recordings.list', 'List your recordings.', 'GET', ['before', 'limit'], [], '', () => import('../../api/v1/recordings/index.js')),
  operation('recordings.read', 'Read a recording you own.', 'GET', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.update', 'Update a recording title.', 'PATCH', ['id'], ['id'], '{title}', () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.delete', 'Delete a recording and its stored artifacts.', 'DELETE', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.project', 'Assign a recording to an authorized project.', 'POST', ['id'], ['id'], '{projectKey}', () => import('../../api/v1/recordings/[id]/project.js')),
  operation('recordings.playback', 'Read recording playback, transcript, keyframes and renewable artifact references.', 'GET', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/playback.js')),
  operation('recordings.agent_payload', 'Read agent context using Record quota and ownership checks.', 'POST', ['id'], ['id'], '{requestKey: UUID}', () => import('../../api/v1/recordings/[id]/agent-payload.js')),
  operation('recordings.retry', 'Retry a failed recording processing stage.', 'POST', ['id'], ['id'], '{stage}', () => import('../../api/v1/recordings/[id]/retry.js')),
  operation('recordings.share_status', 'Read the current recording share.', 'GET', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/share.js')),
  operation('recordings.share', 'Create a recording share.', 'POST', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/share.js')),
  operation('recordings.unshare', 'Revoke a recording share.', 'DELETE', ['id'], ['id'], '', () => import('../../api/v1/recordings/[id]/share.js')),
  operation('audits.capabilities', 'Read Product Audit availability.', 'GET', [], [], '', () => import('../../api/v1/audits/capabilities.js')),
  operation('audits.create', 'Start an authorized project audit. projectKey is required through MCP.', 'POST', [], [], '{url, projectKey}', () => import('../../api/v1/audits/index.js')),
  operation('audits.read', 'Read an authorized project audit.', 'GET', ['auditId'], ['auditId'], '', () => import('../../api/v1/audits/[auditId]/index.js')),
  operation('audits.events', 'Read project audit events after a cursor.', 'GET', ['auditId', 'after', 'limit'], ['auditId'], '', () => import('../../api/v1/audits/[auditId]/events.js')),
  operation('audits.cancel', 'Cancel an authorized project audit.', 'POST', ['auditId'], ['auditId'], '', () => import('../../api/v1/audits/[auditId]/cancel.js')),
  operation('billing.summary', 'Read your plan, usage and billing availability.', 'GET', ['availability'], [], '', () => import('../../api/v1/billing/index.js')),
  operation('billing.action', 'Create checkout or billing portal URL; payment entry remains in the browser. A URL is not a completed purchase.', 'POST', [], [], '{action: "checkout"|"checkout_state"|"portal", plan?: "pro"|"studio", cycle?: "monthly"|"yearly", state?}', () => import('../../api/v1/billing/index.js')),
  operation('admin.identity', 'Check your actual super-admin status.', 'GET', [], [], '', () => import('../../api/v1/admin/me.js')),
  operation('admin.users', 'Read users; requires the actual super-admin role.', 'GET', ['cursor', 'limit'], [], '', () => import('../../api/v1/admin/users.js')),
  operation('admin.projects', 'Read projects; requires the actual super-admin role.', 'GET', ['cursor', 'limit', 'sort', 'direction'], [], '', () => import('../../api/v1/admin/projects.js')),
  operation('admin.stats', 'Read statistics; requires the actual super-admin role.', 'GET', [], [], '', () => import('../../api/v1/admin/stats.js')),
]

export function isDashboardRead(operation: DashboardOperation) { return operation.readOnly ?? operation.method === 'GET' }
