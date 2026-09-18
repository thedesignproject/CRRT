import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitUntil } from '@vercel/functions'
import { accessReviewUrl, buildAccessRequestEmail, notifyAccessRequest, scheduleAccessRequestEmail } from './project-access-email.js'
import { getServiceSupabase } from './supabase.js'
import type { AccessRequest } from './project-access-requests.js'
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
const request = { id: 'r', attempt: 1, project_key: 'p', email: 'user@company.com' } as AccessRequest
const project = { data: { name: 'Demo' }, error: null as null | { message: string } }
const admins = { data: [{ user_id: 'owner' }, { user_id: 'admin' }], error: null as null | { message: string } }
const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(async () => project), then: (resolve: (r: unknown) => unknown) => Promise.resolve(admins).then(resolve) }
const getUserById = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test')
  vi.stubEnv('APP_URL', 'https://crrt.ai')
  vi.stubEnv('COMMENT_ACTIVITY_EMAIL_FROM', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  project.error = admins.error = null
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
  getUserById.mockImplementation(async id => ({ data: { user: { email: `${id}@company.com` } }, error: null }))
  vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => query), auth: { admin: { getUserById } } } as never)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
it('builds safe review links and escaped email content', () => {
  expect(accessReviewUrl('project/a', {})).toBe('https://crrt.ai/dashboard/?accessProject=project%2Fa')
  expect(accessReviewUrl('p', { APP_URL: 'https://app.test/' })).toBe('https://app.test/dashboard/?accessProject=p')
  const message = buildAccessRequestEmail('<Demo>\r\nBcc: x', 'a&"\'@company.com', 'https://app.test/?a=<b>')
  expect(message.subject).not.toMatch(/[\r\n]/)
  expect(message.html).toContain('&lt;Demo&gt;')
  expect(message.html).toContain('&amp;&quot;&#39;')
  expect(message.html).not.toContain('<b>')
  expect(message.text).toContain('Choose a role and accept or deny')
})
it('emails all current admins and owners with per-attempt recipient idempotency', async () => {
  await notifyAccessRequest(request)
  expect(query.eq).toHaveBeenCalledWith('role', 'admin')
  const calls = vi.mocked(fetch).mock.calls
  expect(calls).toHaveLength(2)
  const bodies = calls.map(([, init]) => JSON.parse(init!.body as string))
  expect(bodies.map(b => b.to)).toEqual(['owner@company.com', 'admin@company.com'])
  expect(bodies[0].text).toContain('accessProject=p')
  const key = (i: number) => (vi.mocked(fetch).mock.calls[i][1]!.headers as Record<string, string>)['Idempotency-Key']
  expect(key(0)).not.toBe(key(1))
  await notifyAccessRequest(request)
  expect(key(0)).toBe(key(2))
  vi.stubEnv('COMMENT_ACTIVITY_EMAIL_FROM', 'CRRT <custom@company.com>')
  await notifyAccessRequest({ ...request, attempt: 2 })
  expect(key(0)).not.toBe(key(4))
  expect(JSON.parse(vi.mocked(fetch).mock.calls[4][1]!.body as string).from).toContain('custom@company.com')
})
it('skips missing configuration and recipients', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  await notifyAccessRequest(request)
  expect(getServiceSupabase).not.toHaveBeenCalled()
  vi.stubEnv('RESEND_API_KEY', 'test')
  getUserById.mockResolvedValue({ data: { user: {} }, error: null })
  await notifyAccessRequest(request)
  expect(fetch).not.toHaveBeenCalled()
})
it('isolates each recipient failure and reports lookup and scheduling errors', async () => {
  getUserById.mockResolvedValueOnce({ data: {}, error: { message: 'lookup' } })
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
  await notifyAccessRequest(request)
  expect(console.warn).toHaveBeenCalledTimes(2)
  vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
  await notifyAccessRequest(request)
  project.error = { message: 'project failed' }
  await expect(notifyAccessRequest(request)).rejects.toThrow('project failed')
  scheduleAccessRequestEmail(request)
  await vi.mocked(waitUntil).mock.calls[0][0]
  expect(console.warn).toHaveBeenCalledWith('Access request email failed', expect.any(Error))
  project.error = null; admins.error = { message: 'admins failed' }
  await expect(notifyAccessRequest(request)).rejects.toThrow('admins failed')
  vi.mocked(waitUntil).mockImplementationOnce(() => { throw new Error('schedule') })
  scheduleAccessRequestEmail(request)
  await Promise.resolve()
  expect(console.warn).toHaveBeenCalledWith('Access request email scheduling failed', expect.any(Error))
})
