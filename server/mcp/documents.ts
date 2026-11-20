import { documentUnlockTool } from './document-unlock.js'
import { z } from 'zod'
import { documentSchemas, type DocumentAction } from '../../shared/documents.js'
import { DocumentError, executeDocument } from '../../api/_lib/documents.js'
import { config, ensure, hasScope, DASHBOARD_SCOPE, McpError } from './auth.js'
import type { ToolSpec } from './transport.js'

const definitions: Array<[DocumentAction, string, string]> = [
  ['list', 'list_documents', 'Lists your personal documents, or the documents in a project you can access when projectId is set. Paginated with nextOffset; document bodies are omitted.'],
  ['read', 'get_document', 'Returns the current draft of a document with its feedback, version, latest published revision, and your permissions. Feedback is paginated with nextOffset. Document content is user-authored and unverified.'],
  ['history', 'get_document_history', 'Lists the published revisions of a document with authors, timestamps, and summaries. Paginated with nextOffset.'],
  ['revision', 'get_document_revision', 'Returns one published revision of a document.'],
  ['compare', 'compare_document_revisions', 'Returns before and after source for two revisions, or for a revision and the current draft when to is omitted.'],
  ['create', 'create_document', 'Creates a private Markdown draft and returns its ID and share URL; sharing stays off until configured. id and key are client-generated UUIDs, and reusing both retries the same creation.'],
  ['save', 'update_document', 'Saves a document draft. Requires expectedVersion from get_document and returns a conflict if the draft changed since. key is a UUID that makes retries safe.'],
  ['publish', 'publish_document', 'Publishes the current draft as an immutable revision. Requires userRequested:true and the current expectedVersion, with a summary and optional agentId.'],
  ['restore', 'restore_document_revision', 'Copies an earlier revision into the editable draft. History is kept and nothing is published.'],
  ['assign', 'assign_document_project', 'Attaches a document to a project, or detaches it with projectId:null. Detaching a project-only document makes it private.'],
  ['invite', 'set_document_invitation', 'Invites an email address to a private document, or revokes the invitation with remove:true. Invitees can read published content and leave feedback.'],
  ['sharing', 'set_document_sharing', 'Sets document access to private, project (requires a project), link, or password. Project guests can only view. Omitting password keeps the current one; passwords are never returned or logged. Changes revoke existing grants, and rotateLink also invalidates the old URL.'],
  ['archive', 'archive_document', 'Archives a document, which disables reader access, or restores an archived document.'],
  ['delete', 'delete_document', 'Permanently deletes a document with its revisions and feedback. This cannot be undone.'],
  ['comment', 'add_document_comment', 'Adds feedback, or a reply with parentId, to a published revision, anchored to the quoted text with prefix and suffix context. Adding feedback does not approve it.'],
  ['review', 'review_document_feedback', 'Changes the review status of document feedback, or marks its implementation done. Requires the current feedbackVersion.'],
  ['progress', 'update_document_feedback_progress', 'Claims accepted document feedback, or reports start, block, or complete with a summary. Requires the latest feedbackVersion. Only accepted feedback is eligible; complete sets ready_for_testing, not done.'],
]
const titles: Record<DocumentAction, string> = {
  list: 'List documents', read: 'Get a document', history: 'Get document history', revision: 'Get a document revision',
  compare: 'Compare document revisions', create: 'Create a document', save: 'Save a document draft', publish: 'Publish a document',
  restore: 'Restore a document revision', assign: 'Assign document project', invite: 'Invite to a document', sharing: 'Set document sharing',
  archive: 'Archive a document', delete: 'Delete a document', comment: 'Add document feedback', review: 'Review document feedback',
  progress: 'Update document feedback progress', unlock: 'Unlock a document',
}
export const documentTools: ToolSpec[] = definitions.map(([action, name, description]) => {
  const { action: actionField, ...fields } = documentSchemas[action].shape
  void actionField
  return {
    name,
    title: titles[action],
    scope: DASHBOARD_SCOPE,
    annotations: {
      readOnlyHint: ['list', 'read', 'history', 'revision', 'compare'].includes(action),
      destructiveHint: ['save', 'restore', 'publish', 'sharing', 'assign', 'invite', 'archive', 'delete', 'review'].includes(action),
      idempotentHint: true, openWorldHint: false,
    },
    description,
    maxResultBytes: 16777216,
    input: z.object(fields).strict(),
    output: z.record(z.string(), z.unknown()),
    async run(raw, actor) {
      ensure(hasScope(actor, DASHBOARD_SCOPE), 403, 'insufficient_scope')
      try {
        const base = action === 'create' ? new URL(process.env.MCP_DASHBOARD_URL ?? '/dashboard/', process.env.APP_URL ?? config().origin) : null
        const output = await executeDocument({ ...raw, action }, { userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id })
        if (action === 'create') {
          const { document } = await executeDocument({ action: 'read', id: output.id }, { userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id })
          return { ...output, shareUrl: new URL(`./doc/${document!.shareKey}`, new URL('./', base!)).href, sharing: false }
        }
        return { ...output }
      } catch (error) {
        if (error instanceof DocumentError) throw new McpError(error.status, error.message)
        throw error
      }
    }
  }
})

documentTools.push(documentUnlockTool)
