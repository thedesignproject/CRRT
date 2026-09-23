import { enqueueCommentEmail, processCommentEmailQueue } from './comment-email-outbox.js'

const DEFAULT_COOLDOWN_HOURS = 5
const DEFAULT_FROM = 'CRRT <activity@mail.crrt.ai>'
const DEFAULT_TIMEOUT_MS = 5_000
const MAX_BATCH_SIZE = 100

export type CommentActivityEmailInput = {
  recipients: string[]
  projectName: string
  pageUrl: string
  authorName: string | null
  activityCount: number
  dashboardUrl: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getCommentActivityCooldownSeconds(env = process.env) {
  const hours = Number(env.COMMENT_ACTIVITY_EMAIL_COOLDOWN_HOURS)
  const safeHours = Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_COOLDOWN_HOURS
  return Math.floor(safeHours * 60 * 60)
}

export function getCommentActivityDashboardUrl(env = process.env) {
  return `${(env.APP_URL || 'https://crrt.ai').replace(/\/$/, '')}/dashboard`
}

export function getCommentActivityEmailTimeoutMs(env = process.env) {
  const ms = Number(env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS)
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : DEFAULT_TIMEOUT_MS
}

export function canSendCommentActivityEmail(recipients: string[], env = process.env) {
  return Boolean(env.RESEND_API_KEY) && recipients.some((email) => email.trim().length > 0)
}

export function hasCommentActivityEmailConfig(env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
}

export function buildCommentActivityEmail(input: CommentActivityEmailInput) {
  const projectName = escapeHtml(input.projectName)
  const dashboardUrl = escapeHtml(input.dashboardUrl)
  const pageUrl = escapeHtml(input.pageUrl)
  const author = input.authorName || 'Someone'
  const count = Math.max(1, Math.floor(input.activityCount))
  const isBatch = count > 1
  const subject = isBatch ? `${count} new CRRTs on ${input.projectName}` : `New CRRT on ${input.projectName}`
  const headline = isBatch ? `${count} new CRRTs landed.` : `${author} dropped a CRRT.`
  const body = isBatch
    ? `${count} CRRTs were dropped on your project since the last activity email.`
    : `${author} just dropped a CRRT on your project.`

  return {
    subject,
    text: `${body}\n\nPage: ${input.pageUrl}\nDashboard: ${input.dashboardUrl}`,
    html: `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0A0A0A" style="margin:0;padding:0;background:#0A0A0A;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#181818" style="max-width:560px;background:#181818;border:1px solid #2C2C2C;border-radius:16px;">
        <tr>
          <td style="padding:28px 28px 18px;border-bottom:1px solid #2C2C2C;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:22px;line-height:1;font-weight:bold;color:#FFFFFF;">CRRT<span style="color:#6B6560;">.&gt;</span><span style="color:#E8853D;">_</span></div>
            <div style="padding-top:14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#A8A29A;">/ project activity</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 28px;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#FFB000;">${projectName}</div>
            <h1 style="margin:18px 0 14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:28px;line-height:34px;font-weight:bold;color:#FFFFFF;">${escapeHtml(headline)}</h1>
            <p style="margin:0 0 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:24px;color:#A8A29A;">${escapeHtml(body)}</p>
            <p style="margin:0 0 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:21px;color:#6B6560;word-break:break-all;">${pageUrl}</p>
            <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#E8853D" style="border-radius:999px;background:#E8853D;"><a href="${dashboardUrl}" style="display:inline-block;padding:15px 22px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:14px;line-height:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Open dashboard</a></td></tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim(),
  }
}

export async function sendCommentActivityEmail(input: CommentActivityEmailInput, deliveryId: string) {
  const apiKey = process.env.RESEND_API_KEY
  const recipients = [...new Set(input.recipients.map((email) => email.trim()).filter(Boolean))]
  if (!apiKey || recipients.length === 0) return { skipped: true }

  const from = process.env.COMMENT_ACTIVITY_EMAIL_FROM || DEFAULT_FROM
  const message = buildCommentActivityEmail(input)
  const bodies: string[] = []
  for (let offset = 0; offset < recipients.length; offset += MAX_BATCH_SIZE) {
    bodies.push(JSON.stringify(recipients.slice(offset, offset + MAX_BATCH_SIZE).map((recipient) => ({
      from, to: [recipient], ...message,
    }))))
  }
  await enqueueCommentEmail(deliveryId, bodies)
  // Delivery now belongs to the durable queue. A transient worker failure must
  // never reset the project's activity reservation or requeue successful batches.
  try {
    await processCommentEmailQueue(getCommentActivityEmailTimeoutMs())
  } catch {
    console.warn('Comment email delivery deferred to queue worker')
  }
  return { skipped: false }
}
