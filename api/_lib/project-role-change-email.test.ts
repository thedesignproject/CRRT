import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildProjectRoleChangeEmail,
  getProjectRoleChangeDashboardUrl,
  getProjectRoleChangeEmailTimeoutMs,
  sendProjectRoleChangeEmail,
} from './project-role-change-email.js'

const originalEnv = process.env
const input = (overrides: Partial<Parameters<typeof sendProjectRoleChangeEmail>[0]> = {}) => ({
  recipient: 'member@example.com', projectName: 'Demo', actorEmail: 'owner@example.com',
  previousRole: 'member' as const, role: 'admin' as const,
  dashboardUrl: 'https://crrt.ai/dashboard', ...overrides,
})

beforeEach(() => {
  process.env = { ...originalEnv }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
})

afterEach(() => {
  vi.useRealTimers()
  process.env = originalEnv
  vi.unstubAllGlobals()
})

describe('project role change email', () => {
  it('builds escaped role and ownership messages', () => {
    const admin = buildProjectRoleChangeEmail(input({
      projectName: '<Demo>', actorEmail: 'owner+<tag>@example.com',
      dashboardUrl: 'https://crrt.ai/dashboard?a=<b>',
    }))
    expect(admin.subject).toBe('Your role changed on <Demo>')
    expect(admin.text).toContain('from member to admin')
    expect(admin.html).toContain('You’re now an admin.')
    expect(admin.html).toContain('&lt;Demo&gt;')
    expect(admin.html).toContain('owner+&lt;tag&gt;@example.com')
    expect(admin.html).toContain('https://crrt.ai/dashboard?a=&lt;b&gt;')

    const owner = buildProjectRoleChangeEmail(input({ previousRole: 'admin', role: 'owner' }))
    expect(owner.subject).toBe('You now own Demo on CRRT')
    expect(owner.html).toContain('You’re the owner.')

    const member = buildProjectRoleChangeEmail(input({ previousRole: 'admin', role: 'member' }))
    expect(member.html).toContain('You’re now a member.')

    const injected = buildProjectRoleChangeEmail(input({ projectName: 'Demo\r\nBcc: victim@example.com' }))
    expect(injected.subject).toBe('Your role changed on Demo Bcc: victim@example.com')
    expect(injected.text).not.toContain('\r\nBcc:')
    expect(injected.text).toContain('Demo Bcc: victim@example.com')
  })

  it('uses only the configured application origin for dashboard links', () => {
    expect(getProjectRoleChangeDashboardUrl({ APP_URL: 'https://app.example/' } as NodeJS.ProcessEnv))
      .toBe('https://app.example/dashboard')
    expect(getProjectRoleChangeDashboardUrl({} as NodeJS.ProcessEnv)).toBe('https://crrt.ai/dashboard')
  })

  it('parses the shared timeout configuration safely', () => {
    delete process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS
    expect(getProjectRoleChangeEmailTimeoutMs()).toBe(5_000)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '12.8'
    expect(getProjectRoleChangeEmailTimeoutMs()).toBe(12)
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = 'bad'
    expect(getProjectRoleChangeEmailTimeoutMs()).toBe(5_000)
  })

  it('skips without configuration or a recipient', async () => {
    await expect(sendProjectRoleChangeEmail(input())).resolves.toEqual({ skipped: true })
    process.env.RESEND_API_KEY = 'key'
    await expect(sendProjectRoleChangeEmail(input({ recipient: ' ' }))).resolves.toEqual({ skipped: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends directly to the changed member', async () => {
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_FROM = 'CRRT <roles@mail.crrt.ai>'
    await expect(sendProjectRoleChangeEmail(input({ recipient: ' member@example.com ' })))
      .resolves.toEqual({ skipped: false })
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'CRRT <roles@mail.crrt.ai>', to: 'member@example.com', subject: 'Your role changed on Demo',
    })
  })

  it('uses the existing sender default and surfaces Resend failures', async () => {
    process.env.RESEND_API_KEY = 'key'
    delete process.env.COMMENT_ACTIVITY_EMAIL_FROM
    await sendProjectRoleChangeEmail(input())
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).from).toBe('CRRT <activity@mail.crrt.ai>')

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    await expect(sendProjectRoleChangeEmail(input())).rejects.toThrow('Resend email failed with 503')
  })

  it('aborts a hung request after the configured timeout', async () => {
    vi.useFakeTimers()
    process.env.RESEND_API_KEY = 'key'
    process.env.COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS = '10'
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      ;(init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const send = sendProjectRoleChangeEmail(input())
    const expectation = expect(send).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(10)
    await expectation
  })
})
