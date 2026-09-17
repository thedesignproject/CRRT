import { createHash } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { getServiceSupabase } from './supabase.js'
import { getProjectInviteEmailTimeoutMs } from './project-invite-email.js'
import type { AccessRequest } from './project-access-requests.js'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const header = (value: string) => value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
export function accessReviewUrl(project: string, env = process.env) {
  return `${(env.APP_URL || 'https://crrt.ai').replace(/\/$/, '')}/dashboard/?${new URLSearchParams({ accessProject: project })}`
}
export function buildAccessRequestEmail(projectName: string, email: string, url: string) {
  const message = `${header(email)} requested access to ${header(projectName)}.`
  return {
    subject: `Access request for ${header(projectName)} on CRRT`,
    text: `${message}\n\nChoose a role and accept or deny this request.\nReview request: ${url}`,
    html: `<div style="background:#181818;color:#FFFFFF;padding:28px;font-family:Arial,sans-serif"><h1>Project access request</h1><p>${escape(message)}</p><p>Choose a role and accept or deny this request.</p><a style="color:#E8853D" href="${escape(url)}">Review request</a></div>`,
  }
}

export async function notifyAccessRequest(request: AccessRequest) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Access request email skipped: email configuration is missing')
    return
  }
  const db = getServiceSupabase()
  const { data: project, error: projectError } = await db.from('projects').select('name').eq('public_key', request.project_key).single()
  if (projectError) throw new Error(projectError.message)
  const { data: admins, error: adminError } = await db.from('project_members').select('user_id').eq('project_key', request.project_key).eq('role', 'admin')
  if (adminError) throw new Error(adminError.message)
  const message = buildAccessRequestEmail(project.name, request.email, accessReviewUrl(request.project_key))
  await Promise.all(admins!.map(async admin => {
    try {
      const { data, error } = await db.auth.admin.getUserById(admin.user_id)
      if (error) throw new Error(error.message)
      const recipient = data.user.email
      if (!recipient) return
      const digest = createHash('sha256').update(`${request.id}:${request.attempt}:${recipient.toLowerCase()}`).digest('hex')
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `project-access/${digest}` },
        signal: AbortSignal.timeout(getProjectInviteEmailTimeoutMs()),
        body: JSON.stringify({ from: process.env.COMMENT_ACTIVITY_EMAIL_FROM || 'CRRT <activity@mail.crrt.ai>', to: recipient, ...message }),
      })
      if (!response.ok) throw new Error(`Access email failed with ${response.status}`)
    } catch (error) {
      console.warn('Access request admin email failed', error)
    }
  }))
}

export function scheduleAccessRequestEmail(request: AccessRequest) {
  try {
    waitUntil(notifyAccessRequest(request).catch(error => { console.warn('Access request email failed', error) }))
  } catch (error) {
    console.warn('Access request email scheduling failed', error)
  }
}
