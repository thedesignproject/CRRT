import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildProjectInviteEmail,
  getProjectInviteDashboardUrl,
  getProjectInviteEmailTimeoutMs,
  sendProjectInviteEmail,
} from './project-invite-email.js'

const originalEnv = process.env

function input(overrides: Partial<Parameters<typeof sendProjectInviteEmail>[0]> = {}) {
  return {
    recipient: 'invitee@example.com',
    projectName: 'Demo',
    inviterEmail: 'owner@example.com',
    role: 'member' as const,
    dashboardUrl: 'https://crrt.ai/dashboard',
    ...overrides,
  }
}

beforeEach(() => {
  process.env = { ...originalEnv }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
})

afterEach(() => {
  vi.useRealTimers()
  process.env = originalEnv
  vi.unstubAllGlobals()
})

describe('project invite email', () => {
  it('builds branded member and admin messages with escaped HTML', () => {
    const member = buildProjectInviteEmail(input({
      projectName: '<Demo & Co>',
      inviterEmail: 'owner+<tag>@example.com',
      dashboardUrl: 'https://crrt.ai/dashboard?a=<b>',
    }))
    expect(member.subject).toBe("You're invited to <Demo & Co> on CRRT")
    expect(member.text).toContain('owner+<tag>@example.com invited you to join <Demo & Co> as member')
    expect(member.html).toContain('CRRT<span')
    expect(member.html).toContain('&lt;Demo &amp; Co&gt;')
    expect(member.html).toContain('owner+&lt;tag&gt;@example.com')
    expect(member.html).toContain('https://crrt.ai/dashboard?a=&lt;b&gt;')
    expect(member.html).not.toContain('owner+<tag>@example.com')

    const admin = buildProjectInviteEmail(input({ role: 'admin' }))
    expect(admin.text).toContain('as admin')
    expect(admin.html).toContain('>admin</strong>')
  })

  it('uses a safe timeout default and accepts a positive override', () => {
    delete process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS
    expect(getProjectInviteEmailTimeoutMs()).toBe(5_000)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '25.9'
    expect(getProjectInviteEmailTimeoutMs()).toBe(25)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = 'invalid'
    expect(getProjectInviteEmailTimeoutMs()).toBe(5_000)
  })

  it('builds dashboard links from trusted configuration', () => {
    expect(getProjectInviteDashboardUrl({})).toBe('https://crrt.ai/dashboard')
    expect(getProjectInviteDashboardUrl({ APP_URL: 'https://app.example/' }))
      .toBe('https://app.example/dashboard')
  })

  it('skips without configuration or a recipient', async () => {
    await expect(sendProjectInviteEmail(input())).resolves.toEqual({ skipped: true })
    process.env.RESEND_API_KEY = 'key'
    await expect(sendProjectInviteEmail(input({ recipient: '  ' }))).resolves.toEqual({ skipped: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends directly to the invitee through Resend', async () => {
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_FROM = 'CRRT <invites@mail.crrt.ai>'

    await expect(sendProjectInviteEmail(input({ recipient: ' invitee@example.com ' })))
      .resolves.toEqual({ skipped: false })

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'CRRT <invites@mail.crrt.ai>',
      to: 'invitee@example.com',
      subject: "You're invited to Demo on CRRT",
    })
  })

  it('uses the existing activity sender default', async () => {
    process.env.RESEND_API_KEY = 'key'
    delete process.env.COMMENT_ACTIVITY_EMAIL_FROM
    await sendProjectInviteEmail(input())
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).from).toBe('CRRT <activity@mail.crrt.ai>')
  })

  it('throws when Resend rejects the request', async () => {
    process.env.RESEND_API_KEY = 'key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    await expect(sendProjectInviteEmail(input())).rejects.toThrow('Resend email failed with 500')
  })

  it('aborts a hung request after the configured timeout', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '10'
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    const send = sendProjectInviteEmail(input())
    const expectation = expect(send).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(10)
    await expectation
  })
})
