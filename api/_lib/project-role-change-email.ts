import type { ProjectMemberRole } from './store.js'

const DEFAULT_FROM = 'CRRT <activity@mail.crrt.ai>'
const DEFAULT_TIMEOUT_MS = 5_000
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type ProjectRoleChangeEmailInput = {
  recipient: string
  projectName: string
  actorEmail: string
  previousRole: ProjectMemberRole
  role: ProjectMemberRole
  dashboardUrl: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getProjectRoleChangeEmailTimeoutMs(env = process.env) {
  const ms = Number(env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS)
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : DEFAULT_TIMEOUT_MS
}

export function buildProjectRoleChangeEmail(input: ProjectRoleChangeEmailInput) {
  const projectName = escapeHtml(input.projectName)
  const actorEmail = escapeHtml(input.actorEmail)
  const previousRole = escapeHtml(input.previousRole)
  const role = escapeHtml(input.role)
  const dashboardUrl = escapeHtml(input.dashboardUrl)
  const isOwnershipTransfer = input.role === 'owner'
  const subject = isOwnershipTransfer
    ? `You now own ${input.projectName} on CRRT`
    : `Your role changed on ${input.projectName}`
  const headline = isOwnershipTransfer ? 'You’re the owner.' : `You’re now ${input.role === 'admin' ? 'an admin' : 'a member'}.`
  const body = `${input.actorEmail} changed your role on ${input.projectName} from ${input.previousRole} to ${input.role}.`

  return {
    subject,
    text: `${body}\n\nOpen dashboard: ${input.dashboardUrl}`,
    html: `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0A0A0A" style="margin:0;padding:0;background:#0A0A0A;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#181818" style="max-width:560px;background:#181818;border:1px solid #2C2C2C;border-radius:16px;">
        <tr>
          <td style="padding:28px 28px 18px;border-bottom:1px solid #2C2C2C;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:22px;line-height:1;font-weight:bold;color:#FFFFFF;">CRRT<span style="color:#6B6560;">.&gt;</span><span style="color:#E8853D;">_</span></div>
            <div style="padding-top:14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#A8A29A;">/ project access</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 28px;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#FFB000;">${projectName}</div>
            <h1 style="margin:18px 0 14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:28px;line-height:34px;font-weight:bold;color:#FFFFFF;">${escapeHtml(headline)}</h1>
            <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:24px;color:#A8A29A;"><strong style="color:#FFFFFF;">${actorEmail}</strong> changed your project role.</p>
            <p style="margin:0 0 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:21px;color:#6B6560;">${previousRole} <span style="color:#E8853D;">→</span> ${role}</p>
            <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#E8853D" style="border-radius:999px;background:#E8853D;"><a href="${dashboardUrl}" style="display:inline-block;padding:15px 22px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:14px;line-height:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Open dashboard</a></td></tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim(),
  }
}

export async function sendProjectRoleChangeEmail(input: ProjectRoleChangeEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const recipient = input.recipient.trim()
  if (!apiKey || !recipient) return { skipped: true }

  const message = buildProjectRoleChangeEmail(input)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getProjectRoleChangeEmailTimeoutMs())
  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from: process.env.COMMENT_ACTIVITY_EMAIL_FROM || DEFAULT_FROM,
        to: recipient,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) throw new Error(`Resend email failed with ${response.status}`)
  return { skipped: false }
}
