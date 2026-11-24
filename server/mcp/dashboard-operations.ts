import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
export type DashboardOperation = {
  name: string
  tool: string
  title: string
  description: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query: readonly string[]
  required: readonly string[]
  body: z.ZodRawShape
  readOnly?: boolean
  destructive: boolean
  openWorld: boolean
  superAdmin: boolean
  load: () => Promise<{ default: Handler }>
}
type Hints = { destructive?: boolean; openWorld?: boolean; superAdmin?: boolean }
const operation = (name: string, tool: string, title: string, description: string, method: DashboardOperation['method'], query: readonly string[], required: readonly string[], body: z.ZodRawShape, load: DashboardOperation['load'], hints: Hints = {}): DashboardOperation => ({
  name, tool, title, description, method, query, required, body, load,
  readOnly: method === 'GET' || name === 'recordings.agent_payload',
  // Unlisted writes default to destructive so clients confirm them.
  destructive: method === 'GET' || name === 'recordings.agent_payload' ? false : hints.destructive ?? true,
  openWorld: hints.openWorld ?? false,
  superAdmin: hints.superAdmin ?? false,
})
const additive = { destructive: false } as const
const external = { openWorld: true } as const
const superAdmin = { superAdmin: true } as const

const text = (max = 4000) => z.string().max(max)
const id = z.string().min(1).max(200)
const role = z.enum(['admin', 'member', 'guest'])
const visibility = z.enum(['shared', 'internal']).describe('shared is visible to project guests; internal is team-only.')
const provider = z.enum(['github', 'linear', 'jira'])
const implementationStatus = z.enum(['unassigned', 'claimed', 'in_progress', 'blocked', 'ready_for_testing', 'done'])
const selection = z.union([
  z.object({ mode: z.literal('ids'), ids: z.array(z.string()) }).strict(),
  z.object({ mode: z.literal('all'), excludedIds: z.array(z.string()).optional() }).strict(),
]).describe('Either explicit inbox item IDs, or all inbox items except excludedIds.')

// This is an allowlist, not an HTTP proxy. Callers cannot supply a route, method,
// headers, actor, or import path. Each handler keeps its existing validation,
// actor/role checks, plan gates and side effects. Billing checkout and portal
// URLs are intentionally excluded; billing changes happen in the dashboard.
export const dashboardOperations: DashboardOperation[] = [
  operation('projects.list', 'list_dashboard_projects', 'List projects with dashboard capabilities', 'List your projects and the dashboard capabilities your role grants in each.', 'GET', [], [], {}, () => import('../../api/v1/projects/index.js')),
  operation('projects.availability', 'check_project_key', 'Check project key availability', 'Check whether a proposed public project key is available.', 'GET', ['key'], ['key'], {}, () => import('../../api/v1/projects/availability.js')),
  operation('projects.claim', 'claim_project', 'Create or claim a project', 'Create or claim a project using its public key.', 'POST', [], [], { projectKey: id, name: text().optional() }, () => import('../../api/v1/projects/claim.js'), additive),
  operation('projects.update', 'update_project_settings', 'Update project settings', 'Rename a project or change its allowed origins, widget privacy, or feedback access.', 'PATCH', ['projectId'], ['projectId'], {
    name: text().optional(), allowedOrigins: z.array(text()).optional().describe('Replaces the full list of allowed domains.'),
    widgetPrivate: z.boolean().optional(), feedbackAccess: z.enum(['team', 'admins']).optional(),
  }, () => import('../../api/v1/projects/[projectId]/index.js')),
  operation('projects.export', 'export_project_feedback', 'Export project feedback', 'Export the feedback you are authorized to read in a project. Large projects may exceed the response limit.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/export.js')),
  operation('projects.suggestions', 'list_suggested_projects', 'List suggested projects', 'List projects matching your verified email domain that you can request to join.', 'GET', [], [], {}, () => import('../../api/v1/projects/suggestions.js')),
  operation('feedback.list', 'list_dashboard_feedback', 'List project feedback (dashboard view)', 'List project feedback with the dashboard visibility rules, optionally filtered by page or status.', 'GET', ['projectId', 'pageUrl', 'reviewStatus', 'implementationStatus'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/comments.js')),
  operation('feedback.visibility', 'set_feedback_visibility', 'Set feedback visibility', 'Change whether a feedback item is shared with guests or internal to the team.', 'PATCH', ['commentId'], ['commentId'], { visibility }, () => import('../../api/v1/comments/[commentId]/visibility.js')),
  operation('feedback.review', 'review_feedback', 'Record a feedback review decision', 'Record a human review decision (open, accepted, or rejected) on a feedback item, with optional compare-and-set and undo.', 'PATCH', ['commentId'], ['commentId'], {
    reviewStatus: z.enum(['open', 'accepted', 'rejected']).optional(), expectedUpdatedAt: text().optional().describe('The item updatedAt you last read; rejects stale decisions.'),
    implementationStatus: implementationStatus.optional(), captureUndo: z.boolean().optional(), preserveExternalWork: z.boolean().optional(), undoToken: text().optional(),
  }, () => import('../../api/v1/comments/[commentId]/review-status.js')),
  operation('feedback.implementation', 'set_feedback_implementation_status', 'Set feedback implementation status', 'Set the implementation status of a feedback item.', 'PATCH', ['commentId'], ['commentId'], { implementationStatus }, () => import('../../api/v1/comments/[commentId]/implementation-status.js')),
  operation('inbox.list', 'list_inbox_feedback', 'List inbox feedback', 'List feedback you captured with the browser extension.', 'GET', ['page', 'limit'], [], {}, () => import('../../api/v1/extension/comments/index.js')),
  operation('inbox.update', 'update_inbox_feedback', 'Update inbox feedback', 'Edit captured feedback text or assign it to a project.', 'PATCH', ['commentId'], ['commentId'], { body: text(100000).optional(), projectId: id.optional(), visibility: visibility.optional() }, () => import('../../api/v1/extension/comments/[commentId].js')),
  operation('inbox.delete', 'delete_inbox_feedback', 'Delete inbox feedback', 'Delete one captured feedback item from your inbox.', 'DELETE', ['commentId'], ['commentId'], {}, () => import('../../api/v1/extension/comments/[commentId].js')),
  operation('inbox.bulk', 'bulk_update_inbox_feedback', 'Bulk assign or delete inbox feedback', 'Assign many captured feedback items to a project, or delete them.', 'POST', [], [], {
    operation: z.enum(['assign', 'delete']), selection, projectId: id.optional(), visibility: visibility.optional(), captureUndo: z.boolean().optional(),
  }, () => import('../../api/v1/extension/comments/bulk.js')),
  operation('inbox.restore', 'restore_inbox_feedback', 'Restore deleted inbox feedback', 'Restore previously deleted inbox feedback using the versions returned when it was deleted.', 'POST', [], [], {
    projectId: id, items: z.array(z.object({ id: z.string(), updatedAt: z.string() }).strict()).min(1).max(500),
  }, () => import('../../api/v1/extension/comments/restore.js'), additive),
  operation('repository.read', 'get_repository_settings', 'Get repository settings', 'Read the project repository connection, commands, and agent instructions.', 'GET', ['projectId', 'view'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/repo-config.js')),
  operation('repository.update', 'update_repository_settings', 'Update repository settings', 'Update agent instructions and commands, or connect or disconnect a verified GitHub repository. These are separate updates and cannot be combined.', 'PATCH', ['projectId'], ['projectId'], {
    agentInstructions: z.string().nullable().optional(), localPath: text(400).nullable().optional(), devCommand: text(400).nullable().optional(), testCommand: text(400).nullable().optional(),
    repoUrl: text().nullable().optional().describe('A GitHub repository URL, or null to disconnect.'), installationToken: text().optional().describe('The verification token from get_github_verification.'),
  }, () => import('../../api/v1/projects/[projectId]/repo-config.js'), external),
  operation('repository.completion', 'get_github_verification', 'Get GitHub verification result', 'Read the result of a GitHub browser verification flow started by list_github_installations.', 'GET', ['projectId', 'flowId'], ['projectId', 'flowId'], {}, () => import('../../api/v1/projects/[projectId]/github/completion.js'), external),
  operation('repository.installations', 'list_github_installations', 'List GitHub installations', 'List available GitHub app installations, or get the browser URL to install the app.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/github/install.js'), external),
  operation('members.list', 'list_project_members', 'List project members', 'List the members of a project and their roles.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/members.js')),
  operation('members.role', 'change_member_role', 'Change a member role', 'Change a project member role, subject to owner and admin rules.', 'PATCH', ['projectId', 'userId'], ['projectId', 'userId'], { role: z.enum(['owner', 'admin', 'member', 'guest']) }, () => import('../../api/v1/projects/[projectId]/members/[userId].js')),
  operation('members.remove', 'remove_project_member', 'Remove a project member', 'Remove a member from a project, subject to owner and admin rules.', 'DELETE', ['projectId', 'userId'], ['projectId', 'userId'], {}, () => import('../../api/v1/projects/[projectId]/members/[userId].js')),
  operation('invites.list_project', 'list_project_invitations', 'List project invitations', 'List pending invitations for a project.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/invites.js')),
  operation('invites.send', 'send_project_invitation', 'Invite someone to a project', 'Invite a person to a project. Sends the standard invitation email.', 'POST', ['projectId'], ['projectId'], { email: text(), role: role.optional() }, () => import('../../api/v1/projects/[projectId]/invites.js'), { destructive: false, openWorld: true }),
  operation('invites.cancel', 'cancel_project_invitation', 'Cancel a project invitation', 'Cancel a pending project invitation.', 'DELETE', ['projectId', 'email'], ['projectId', 'email'], {}, () => import('../../api/v1/projects/[projectId]/invites.js')),
  operation('invites.list_received', 'list_my_invitations', 'List my invitations', 'List project invitations addressed to you.', 'GET', [], [], {}, () => import('../../api/v1/invites/index.js')),
  operation('invites.accept', 'accept_invitation', 'Accept an invitation', 'Accept a project invitation addressed to you.', 'POST', [], [], { projectKey: id }, () => import('../../api/v1/invites/accept.js'), additive),
  operation('invites.decline', 'decline_invitation', 'Decline an invitation', 'Decline a project invitation addressed to you.', 'POST', [], [], { projectKey: id }, () => import('../../api/v1/invites/decline.js')),
  operation('domains.list', 'list_email_domains', 'List project email domains', 'List the email domains whose verified users can request access to a project.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/email-domains.js')),
  operation('domains.add', 'add_email_domain', 'Add a project email domain', 'Add an email domain whose verified users can request access to a project.', 'POST', ['projectId'], ['projectId'], { domain: text() }, () => import('../../api/v1/projects/[projectId]/email-domains.js'), additive),
  operation('domains.remove', 'remove_email_domain', 'Remove a project email domain', 'Remove an email domain from a project.', 'DELETE', ['projectId', 'domain'], ['projectId', 'domain'], {}, () => import('../../api/v1/projects/[projectId]/email-domains.js')),
  operation('access.list_requests', 'list_access_requests', 'List project access requests', 'List pending requests to join a project.', 'GET', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/access-requests/index.js')),
  operation('access.request', 'request_project_access', 'Request project access', 'Ask a project admin for access to a project.', 'POST', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/access-requests/index.js'), additive),
  operation('access.decide', 'decide_access_request', 'Approve or decline an access request', 'Approve or decline a request to join a project.', 'PATCH', ['projectId', 'requestId'], ['projectId', 'requestId'], {
    decision: z.enum(['approved', 'declined']), role: role.optional().describe('Defaults to member.'), attempt: z.number().int().describe('The request attempt number you last read.'),
  }, () => import('../../api/v1/projects/[projectId]/access-requests/[requestId].js')),
  operation('external_work.draft', 'get_external_work_draft', 'Get external work draft', 'Read a draft GitHub, Linear, or Jira issue for a feedback item, and any work already linked to it.', 'GET', ['commentId', 'provider'], ['commentId'], {}, () => import('../../api/v1/comments/[commentId]/external-work.js'), external),
  operation('external_work.send', 'send_external_work', 'Send feedback to an issue tracker', 'Create a GitHub, Linear, or Jira issue from a feedback item. Duplicate sends are deduplicated.', 'POST', ['commentId'], ['commentId'], {
    provider, draft: z.object({ title: text(), body: text(100000) }).strict(),
  }, () => import('../../api/v1/comments/[commentId]/external-work.js'), { destructive: false, openWorld: true }),
  operation('external_work.retry', 'retry_external_work_sync', 'Retry external work sync', 'Retry synchronizing a feedback item with its linked tracker issue.', 'POST', ['commentId'], ['commentId'], {}, () => import('../../api/v1/comments/[commentId]/external-work-sync.js'), { destructive: false, openWorld: true }),
  operation('external_work.recover', 'resolve_pending_external_work', 'Resolve a pending tracker export', 'Resolve a tracker export whose outcome is unknown, after the tracker has been checked for a created issue.', 'POST', ['commentId'], ['commentId'], {
    provider, confirmCheckedTracker: z.literal(true),
  }, () => import('../../api/v1/comments/[commentId]/external-work-recovery.js'), external),
  operation('linear.read', 'get_linear_integration', 'Get Linear integration', 'Read the project Linear integration. With action=authorize, returns the browser URL to connect Linear.', 'GET', ['projectId', 'action'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/integrations/linear.js'), external),
  operation('linear.select', 'select_linear_team', 'Select Linear team', 'Choose the Linear team that receives issues from this project.', 'PATCH', ['projectId'], ['projectId'], { containerId: id }, () => import('../../api/v1/projects/[projectId]/integrations/linear.js'), external),
  operation('linear.disconnect', 'disconnect_linear', 'Disconnect Linear', 'Disconnect Linear from a project.', 'DELETE', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/integrations/linear.js'), external),
  operation('jira.read', 'get_jira_integration', 'Get Jira integration', 'Read the project Jira integration. With action=authorize, returns the browser URL to connect Jira.', 'GET', ['projectId', 'action'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/integrations/jira.js'), external),
  operation('jira.select', 'select_jira_project', 'Select Jira project', 'Choose the Jira project that receives issues from this project.', 'PATCH', ['projectId'], ['projectId'], { containerId: id }, () => import('../../api/v1/projects/[projectId]/integrations/jira.js'), external),
  operation('jira.disconnect', 'disconnect_jira', 'Disconnect Jira', 'Disconnect Jira from a project.', 'DELETE', ['projectId'], ['projectId'], {}, () => import('../../api/v1/projects/[projectId]/integrations/jira.js'), external),
  operation('storybook.read', 'get_storybook_integration', 'Get Storybook integration', 'Read the Storybook connections for a project.', 'GET', ['projectKey'], ['projectKey'], {}, () => import('../../api/v1/storybook/connections/index.js')),
  operation('storybook.disconnect', 'disconnect_storybook', 'Disconnect Storybook', 'Revoke a Storybook connection from a project.', 'DELETE', ['projectKey', 'connectionId'], ['projectKey', 'connectionId'], {}, () => import('../../api/v1/storybook/connections/index.js')),
  operation('storybook.pair', 'create_storybook_pairing_code', 'Create Storybook pairing code', 'Create a short-lived code for pairing a Storybook instance with a project.', 'POST', [], [], { projectKey: id }, () => import('../../api/v1/storybook/pairings/index.js'), additive),
  operation('shares.create', 'create_feedback_share', 'Create a feedback handoff share', 'Create a handoff share for a page or a selection of feedback. The returned link grants access to anyone who holds it.', 'POST', [], [], {
    projectId: id, scopeType: z.enum(['page', 'selection']), pageUrl: text().optional(), commentIds: z.array(z.string()).optional(),
  }, () => import('../../api/v1/feedback-shares/index.js'), additive),
  operation('shares.prompt', 'get_feedback_share_prompt', 'Get feedback share prompt', 'Read the agent prompt for a feedback share you created.', 'GET', ['shareId', 'target'], ['shareId'], {}, () => import('../../api/v1/feedback-shares/[shareId]/prompt.js')),
  operation('notifications.list', 'list_notifications', 'List notifications', 'List your notifications.', 'GET', ['unreadOnly'], [], {}, () => import('../../api/v1/notifications/index.js')),
  operation('notifications.read', 'mark_notification_read', 'Mark notification read', 'Mark one notification as read.', 'POST', ['notificationId'], ['notificationId'], {}, () => import('../../api/v1/notifications/[notificationId]/read.js'), additive),
  operation('notifications.read_all', 'mark_all_notifications_read', 'Mark all notifications read', 'Mark all of your notifications as read.', 'POST', [], [], {}, () => import('../../api/v1/notifications/read-all.js'), additive),
  operation('recordings.capabilities', 'get_recording_capabilities', 'Get recording capabilities', 'Read whether recording is available to you and its limits.', 'GET', [], [], {}, () => import('../../api/v1/recordings/capabilities.js')),
  operation('recordings.list', 'list_recordings', 'List recordings', 'List your screen recordings.', 'GET', ['before', 'limit'], [], {}, () => import('../../api/v1/recordings/index.js')),
  operation('recordings.read', 'get_recording', 'Get a recording', 'Read a recording you own.', 'GET', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.update', 'rename_recording', 'Rename a recording', 'Change the title of a recording.', 'PATCH', ['id'], ['id'], { title: text() }, () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.delete', 'delete_recording', 'Delete a recording', 'Delete a recording and its stored files.', 'DELETE', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/index.js')),
  operation('recordings.project', 'set_recording_project', 'Set recording project', 'Assign a recording to a project, or pass projectKey null to unassign it.', 'POST', ['id'], ['id'], { projectKey: z.string().max(120).nullable() }, () => import('../../api/v1/recordings/[id]/project.js')),
  operation('recordings.playback', 'get_recording_playback', 'Get recording playback', 'Read recording playback, transcript, keyframes, and renewable file references.', 'GET', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/playback.js')),
  operation('recordings.agent_payload', 'get_recording_agent_context', 'Get recording agent context', 'Read the agent context for a recording. Counts against the recording quota once per requestKey.', 'POST', ['id'], ['id'], { requestKey: z.uuid() }, () => import('../../api/v1/recordings/[id]/agent-payload.js')),
  operation('recordings.retry', 'retry_recording_processing', 'Retry recording processing', 'Retry a failed recording processing stage.', 'POST', ['id'], ['id'], { stage: z.enum(['metadata', 'transcription', 'alignment']) }, () => import('../../api/v1/recordings/[id]/retry.js'), additive),
  operation('recordings.share_status', 'get_recording_share', 'Get recording share', 'Read the current share link state for a recording.', 'GET', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/share.js')),
  operation('recordings.share', 'share_recording', 'Share a recording', 'Create a share link for a recording.', 'POST', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/share.js'), additive),
  operation('recordings.unshare', 'unshare_recording', 'Revoke a recording share', 'Revoke the share link for a recording.', 'DELETE', ['id'], ['id'], {}, () => import('../../api/v1/recordings/[id]/share.js')),
  operation('audits.capabilities', 'get_audit_capabilities', 'Get audit capabilities', 'Read whether product audits are available to you.', 'GET', [], [], {}, () => import('../../api/v1/audits/capabilities.js')),
  operation('audits.create', 'start_project_audit', 'Start a product audit', 'Start a product audit of a URL within a project.', 'POST', [], [], { url: text(), projectKey: z.string().min(1).max(120) }, () => import('../../api/v1/audits/index.js'), { destructive: false, openWorld: true }),
  operation('audits.read', 'get_project_audit', 'Get a product audit', 'Read a product audit you are authorized to view.', 'GET', ['auditId'], ['auditId'], {}, () => import('../../api/v1/audits/[auditId]/index.js')),
  operation('audits.events', 'list_audit_events', 'List audit events', 'Read product audit events after a cursor.', 'GET', ['auditId', 'after', 'limit'], ['auditId'], {}, () => import('../../api/v1/audits/[auditId]/events.js')),
  operation('audits.cancel', 'cancel_project_audit', 'Cancel a product audit', 'Cancel a running product audit.', 'POST', ['auditId'], ['auditId'], {}, () => import('../../api/v1/audits/[auditId]/cancel.js')),
  operation('billing.summary', 'get_billing_summary', 'Get plan and usage', 'Read your current plan, usage, and feature availability. Billing changes are made in the CRRT dashboard.', 'GET', ['availability'], [], {}, () => import('../../api/v1/billing/index.js')),
  operation('admin.identity', 'get_admin_status', 'Get admin status', 'Check whether your account has the super-admin role.', 'GET', [], [], {}, () => import('../../api/v1/admin/me.js')),
  operation('admin.users', 'admin_list_users', 'List users (super-admin)', 'List CRRT users. Requires the super-admin role.', 'GET', ['cursor', 'limit'], [], {}, () => import('../../api/v1/admin/users.js'), superAdmin),
  operation('admin.projects', 'admin_list_projects', 'List all projects (super-admin)', 'List all CRRT projects. Requires the super-admin role.', 'GET', ['cursor', 'limit', 'sort', 'direction'], [], {}, () => import('../../api/v1/admin/projects.js'), superAdmin),
  operation('admin.stats', 'admin_get_stats', 'Get platform statistics (super-admin)', 'Read CRRT platform statistics. Requires the super-admin role.', 'GET', [], [], {}, () => import('../../api/v1/admin/stats.js'), superAdmin),
]

export function isDashboardRead(operation: Pick<DashboardOperation, 'method' | 'readOnly'>) { return operation.readOnly ?? operation.method === 'GET' }
