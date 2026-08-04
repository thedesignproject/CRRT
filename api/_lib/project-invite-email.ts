const DEFAULT_FROM = 'CRRT <activity@mail.crrt.ai>'
const DEFAULT_TIMEOUT_MS = 5_000
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type ProjectInviteEmailInput = {
  recipient: string
  projectName: string
  inviterEmail: string
  role: 'admin' | 'member'
  dashboardUrl: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeEmailHeader(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
}

export function getProjectInviteEmailTimeoutMs(env = process.env) {
  const ms = Number(env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS)
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : DEFAULT_TIMEOUT_MS
}

export function getProjectInviteDashboardUrl(env = process.env) {
  return `${(env.APP_URL || 'https://crrt.ai').replace(/\/$/, '')}/dashboard`
}

export function buildProjectInviteEmail(input: ProjectInviteEmailInput) {
  const projectName = escapeHtml(input.projectName)
  const inviterEmail = escapeHtml(input.inviterEmail)
  const dashboardUrl = escapeHtml(input.dashboardUrl)
  const role = escapeHtml(input.role)
  const subject = `You're invited to ${sanitizeEmailHeader(input.projectName)} on CRRT`
  const body = `${input.inviterEmail} invited you to join ${input.projectName} as ${input.role}.`

  return {
    subject,
    text: `${body}\n\nReview invitation: ${input.dashboardUrl}`,
    html: `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0A0A0A" style="margin:0;padding:0;background:#0A0A0A;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#181818" style="max-width:560px;background:#181818;border:1px solid #2C2C2C;border-radius:16px;">
        <tr>
          <td style="padding:28px 28px 18px;border-bottom:1px solid #2C2C2C;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:22px;line-height:1;font-weight:bold;color:#FFFFFF;">CRRT<span style="color:#6B6560;">.&gt;</span><span style="color:#E8853D;">_</span></div>
            <div style="padding-top:14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#A8A29A;">/ project invitation</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 28px;">
            <div style="font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:13px;line-height:18px;color:#FFB000;">${projectName}</div>
            <h1 style="margin:18px 0 14px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:28px;line-height:34px;font-weight:bold;color:#FFFFFF;">You're invited.</h1>
            <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:24px;color:#A8A29A;"><strong style="color:#FFFFFF;">${inviterEmail}</strong> invited you to join this project as <strong style="color:#FFFFFF;">${role}</strong>.</p>
            <p style="margin:0 0 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:21px;color:#6B6560;">Sign in or create an account with this email address to respond.</p>
            <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#E8853D" style="border-radius:999px;background:#E8853D;"><a href="${dashboardUrl}" style="display:inline-block;padding:15px 22px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;font-size:14px;line-height:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Review invitation</a></td></tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim(),
  }
}

export async function sendProjectInviteEmail(input: ProjectInviteEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const recipient = input.recipient.trim()
  if (!apiKey || !recipient) return { skipped: true }

  const message = buildProjectInviteEmail(input)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getProjectInviteEmailTimeoutMs())
  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
