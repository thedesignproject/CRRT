import { createHmac, timingSafeEqual } from 'node:crypto'

export function issueScreenshotToken(projectId: string, commentId: string, storagePath: string) {
  const secret = process.env.WIDGET_AUTH_SECRET
  if (!secret) throw new Error('missing_widget_auth_secret')
  return createHmac('sha256', secret).update(JSON.stringify(['issue-screenshot:v1', projectId, commentId, storagePath])).digest('base64url')
}

export function issueScreenshotUrl(projectId: string, commentId: string, storagePath: string) {
  const base = (process.env.APP_URL || 'https://crrt.ai').replace(/\/$/, '')
  return `${base}/api/v1/comments/${encodeURIComponent(commentId)}/issue-screenshot?token=${issueScreenshotToken(projectId, commentId, storagePath)}`
}

export function verifyIssueScreenshotToken(token: string, projectId: string, commentId: string, storagePath: string) {
  const expected = Buffer.from(issueScreenshotToken(projectId, commentId, storagePath))
  const actual = Buffer.from(token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
