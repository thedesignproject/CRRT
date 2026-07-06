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

  it('skips without config or recipients and sends BCC through Resend', async () => {
    await expect(sendCommentActivityEmail({
      recipients: ['a@example.com'],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })).resolves.toEqual({ skipped: true })
    expect(fetch).not.toHaveBeenCalled()

    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_FROM = 'CRRT <activity@mail.crrt.ai>'
    await expect(sendCommentActivityEmail({
      recipients: ['a@example.com', 'a@example.com', ' b@example.com '],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })).resolves.toEqual({ skipped: false })

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'CRRT <activity@mail.crrt.ai>',
      to: 'activity@mail.crrt.ai',
      bcc: ['a@example.com', 'b@example.com'],
      subject: 'New CRRT on Demo',
    })

    vi.mocked(fetch).mockClear()
    process.env.COMMENT_ACTIVITY_EMAIL_FROM = 'activity@mail.crrt.ai'
    await expect(sendCommentActivityEmail({
      recipients: ['a@example.com'],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })).resolves.toEqual({ skipped: false })

    const [, bareInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(bareInit.body))).toMatchObject({
      from: 'activity@mail.crrt.ai',
      to: 'activity@mail.crrt.ai',
    })
  })

  it('throws when Resend rejects the request', async () => {
    process.env.RESEND_API_KEY = 'key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(sendCommentActivityEmail({
      recipients: ['a@example.com'],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })).rejects.toThrow('Resend email failed with 500')
  })

  it('aborts hung Resend requests after the configured timeout', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '10'
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    const send = sendCommentActivityEmail({
      recipients: ['a@example.com'],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: null,
      activityCount: 1,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })
    const expectation = expect(send).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(10)
    await expectation
    vi.useRealTimers()
  })
})
