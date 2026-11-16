import type { DocumentComment, DocumentResult } from '../../../shared/documents'
export function mergeFeedback(current: DocumentComment[], incoming: DocumentComment[]) {
  return [...new Map([...current, ...incoming].map((row) => [row.id, row])).values()]
}
export class DocumentRequestError extends Error {
  constructor(public code: string) {
    super(code)
  }
}
export async function documentRequest(apiBase: string, session: string | null, input: object, signal?: AbortSignal): Promise<DocumentResult> {
  const response = await fetch(`${apiBase}/v1/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: JSON.stringify(input),
    signal
  })
  const data = await response.json()
  if (!response.ok) throw new DocumentRequestError(data.error ?? 'document_unavailable')
  return data
}
const messages: Record<string, string> = {
  document_busy: 'Wait for the current request to finish, then try again.',
  feedback_account_changed: 'Sign back in to the account that started this feedback, or discard it to start a new note.',
  feedback_draft_changed: 'Retry or discard your pending feedback before changing it.',
  password_required: 'Enter the password to open this document.',
  incorrect_password: 'That password did not work. Try again.',
  document_not_found: 'This document is unavailable. Its link may have changed or sharing may be turned off.',
  version_conflict: 'This document changed elsewhere. Reload the latest version before saving. Your text is still here.',
  idempotency_conflict: 'This request changed while it was being retried. Reload and try again.',
  forbidden: 'You do not have permission to do this.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  invalid_request: 'Check the fields and try again.',
  plan_limit: 'Your project has reached its plan limit.',
  revision_not_found: 'A newer revision is available. Reload it below; your feedback draft will be preserved.',
  selection_changed: 'Select the passage again in the latest revision, or clear it to leave a general note.',
  login_required: 'Log in to CRRT to open this document.'
}
export function documentMessage(error: unknown) {
  return error instanceof DocumentRequestError ? (messages[error.code] ?? 'Could not complete this request. Please try again.') : 'Could not connect. Check your connection and try again.'
}
