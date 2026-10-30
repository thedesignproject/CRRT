import { McpError, type McpIdentity } from './auth.js'
export function audit(requestId: string, tool: string, actor: McpIdentity | undefined, started: number, payload?: Record<string, unknown>, failure?: unknown) {
  const feedback = payload?.feedback as Record<string, unknown> | unknown[] | undefined
  const pages = payload?.pages as Array<{ feedback: unknown[] }> | undefined
  const projects = payload?.projects as unknown[] | undefined
  const project = payload?.project as { id: string } | undefined
  const count = projects?.length ?? (Array.isArray(feedback) ? feedback.length : feedback ? 1 : pages?.reduce((sum, page) => sum + page.feedback.length, 0) ?? (Array.isArray(payload?.feedbackIds) ? payload.feedbackIds.length : payload?.feedbackId ? 1 : 0))
  console.info(JSON.stringify({ event: 'crrt.mcp', requestId, tool, userId: actor?.user_id ?? null,
    projectId: payload?.projectId ?? project?.id ?? (Array.isArray(feedback) ? null : feedback?.projectId) ?? null,
    resultCount: count, latencyMs: Date.now() - started,
    failureCategory: failure ? failure instanceof McpError ? failure.code.split(':')[0] : 'internal' : null }))
}
