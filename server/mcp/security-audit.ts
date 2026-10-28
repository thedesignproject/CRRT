// Only server-selected metadata enters this logger. Never pass OAuth bodies,
// callback URLs, credentials, feedback, or arbitrary exception messages.
export function securityAudit(requestId: string, action: string, started: number, userId: string | null, failureCategory: string | null) {
  console.info(JSON.stringify({ event: 'crrt.mcp.security', requestId, action, userId,
    latencyMs: Date.now() - started, failureCategory }))
}
