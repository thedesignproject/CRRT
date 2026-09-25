import { enqueueCommentEmail, processCommentEmailQueue } from './comment-email-outbox.js'

vi.mock('./comment-email-outbox.js', () => ({ enqueueCommentEmail: vi.fn(), processCommentEmailQueue: vi.fn() }))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommentActivityEmail,
  canSendCommentActivityEmail,
  getCommentActivityCooldownSeconds,
  getCommentActivityDashboardUrl,
  getCommentActivityEmailTimeoutMs,
  hasCommentActivityEmailConfig,
  sendCommentActivityEmail,
} from './comment-activity-email.js'

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv }
  vi.mocked(enqueueCommentEmail).mockReset().mockResolvedValue(undefined)
  vi.mocked(processCommentEmailQueue).mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
})

afterEach(() => {
  vi.useRealTimers()
  process.env = originalEnv
  vi.unstubAllGlobals()
})

describe('comment activity email helpers', () => {
  it('defaults and parses the cooldown env in seconds', () => {
    delete process.env.COMMENT_ACTIVITY_EMAIL_COOLDOWN_HOURS
    expect(getCommentActivityCooldownSeconds()).toBe(18_000)

    process.env.COMMENT_ACTIVITY_EMAIL_COOLDOWN_HOURS = '0.5'
    expect(getCommentActivityCooldownSeconds()).toBe(1_800)

    process.env.COMMENT_ACTIVITY_EMAIL_COOLDOWN_HOURS = 'nope'
    expect(getCommentActivityCooldownSeconds()).toBe(18_000)
  })

  it('uses APP_URL for dashboard links and gates sends on config plus recipients', () => {
    expect(getCommentActivityDashboardUrl()).toBe('https://crrt.ai/dashboard')
    process.env.APP_URL = 'https://app.example/'
    expect(getCommentActivityDashboardUrl()).toBe('https://app.example/dashboard')

    expect(canSendCommentActivityEmail(['a@example.com'])).toBe(false)
    process.env.RESEND_API_KEY = 'key'
    expect(hasCommentActivityEmailConfig()).toBe(false)
    process.env.SUPABASE_URL = 'https://supa.example'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    expect(hasCommentActivityEmailConfig()).toBe(true)
    expect(canSendCommentActivityEmail(['  '])).toBe(false)
    expect(canSendCommentActivityEmail(['a@example.com'])).toBe(true)

    delete process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS
    expect(getCommentActivityEmailTimeoutMs()).toBe(5_000)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '25.9'
    expect(getCommentActivityEmailTimeoutMs()).toBe(25)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = 'nope'
    expect(getCommentActivityEmailTimeoutMs()).toBe(5_000)
  })

  it('builds single and batch email copy with escaped HTML', () => {
    const single = buildCommentActivityEmail({
      recipients: [],
      projectName: '<Demo>',
      pageUrl: 'https://example.com?a=<b>',
      authorName: 'Mira & Co',
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })
    expect(single.subject).toBe('New CRRT on <Demo>')
    expect(single.html).toContain('&lt;Demo&gt;')
    expect(single.text).toContain('Mira & Co just dropped a CRRT')
    expect(single.html).toContain('Mira &amp; Co dropped a CRRT.')
    expect(single.html).not.toContain('Mira &amp;amp; Co')

    const batch = buildCommentActivityEmail({
      recipients: [],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 4,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })
    expect(batch.subject).toBe('4 new CRRTs on Demo')
    expect(batch.text).toContain('4 CRRTs were dropped')
  })

  const input = {
    recipients: ['a@example.com', 'a@example.com', ' b@example.com '],
    projectName: 'Demo', pageUrl: 'https://example.com', authorName: null,
    activityCount: 1, dashboardUrl: 'https://crrt.ai/dashboard',
  }

  it('does not queue without a key or nonempty recipients', async () => {
    delete process.env.RESEND_API_KEY
    expect(await sendCommentActivityEmail(input, 'delivery')).toEqual({ skipped: true })
    process.env.RESEND_API_KEY = 'key'
    expect(await sendCommentActivityEmail({ ...input, recipients: [' ', ''] }, 'delivery')).toEqual({ skipped: true })
    expect(enqueueCommentEmail).not.toHaveBeenCalled()
    expect(processCommentEmailQueue).not.toHaveBeenCalled()
  })

  it('freezes private messages and queues every batch before running delivery', async () => {
    process.env.RESEND_API_KEY = 'key'
    delete process.env.COMMENT_ACTIVITY_EMAIL_FROM
    expect(await sendCommentActivityEmail(input, 'delivery')).toEqual({ skipped: false })
    const [id, bodies] = vi.mocked(enqueueCommentEmail).mock.calls[0]
    expect(id).toBe('delivery')
    expect(bodies).toHaveLength(1)
    const messages = JSON.parse(bodies[0])
    expect(messages.map((message: { to: string[] }) => message.to)).toEqual([['a@example.com'], ['b@example.com']])
    for (const message of messages) {
      expect(message.from).toBe('CRRT <activity@mail.crrt.ai>')
      expect(message.subject).toBe('New CRRT on Demo')
      expect(message).not.toHaveProperty('bcc')
      expect(message).not.toHaveProperty('cc')
    }
    expect(vi.mocked(enqueueCommentEmail).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(processCommentEmailQueue).mock.invocationCallOrder[0])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('queues large lists in immutable batches using the configured sender', async () => {
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_FROM = 'Team <other@example.com>'
    const recipients = Array.from({ length: 201 }, (_, i) => `member${i}@example.com`)
    await sendCommentActivityEmail({ ...input, recipients }, 'delivery')
    const batches = vi.mocked(enqueueCommentEmail).mock.calls[0][1].map((body) => JSON.parse(body))
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1])
    expect(batches.flat().map((message) => message.to)).toEqual(recipients.map((email) => [email]))
    expect(batches.flat().every((message) => message.from === 'Team <other@example.com>')).toBe(true)
  })

  it('never sends when durable persistence fails', async () => {
    process.env.RESEND_API_KEY = 'key'
    vi.mocked(enqueueCommentEmail).mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(sendCommentActivityEmail(input, 'delivery')).rejects.toThrow('queue unavailable')
    expect(processCommentEmailQueue).not.toHaveBeenCalled()
  })

  it('leaves retries to the queue without failing an already queued notification', async () => {
    process.env.RESEND_API_KEY = 'key'
    vi.mocked(processCommentEmailQueue).mockRejectedValueOnce(new Error('worker unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await sendCommentActivityEmail(input, 'delivery')).toEqual({ skipped: false })
    expect(warn).toHaveBeenCalledWith('Comment email delivery deferred to queue worker')
    warn.mockRestore()
  })
})
