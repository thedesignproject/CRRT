import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from '../../../_lib/supabase.js'
import { issueScreenshotToken, issueScreenshotUrl, verifyIssueScreenshotToken } from '../../../_lib/issue-screenshot.js'
import handler from './issue-screenshot.js'

let result: any, signed: any
const row = { id: 'c', project_id: 'p', screenshot_storage_path: 'p/image.png', github_issue_url: 'https://github.com/acme/repo/issues/1' }
beforeEach(() => {
  vi.stubEnv('WIDGET_AUTH_SECRET', 'local-test-secret')
  result = { data: row, error: null }
  signed = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/short-lived' }, error: null })
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => result }
  vi.mocked(getServiceSupabase).mockReturnValue({ from: () => q, storage: { from: () => ({ createSignedUrl: signed }) } } as never)
})
afterEach(() => vi.unstubAllEnvs())
async function request(method = 'GET', query: any = { commentId: 'c', token: issueScreenshotToken('p', 'c', 'p/image.png') }) {
  const res: any = { code: 200, headers: {}, status(n: number) { this.code = n; return this }, json(body: any) { this.body = body; return this }, end() { return this }, setHeader(k: string, v: string) { this.headers[k] = v } }
  await handler({ method, query, headers: {} } as never, res)
  return res
}
it('regenerates short-lived storage URLs through a durable screenshot-only export capability', async () => {
  const res = await request()
  expect(res.code).toBe(302)
  expect(res.headers).toMatchObject({ Location: 'https://storage.test/short-lived', 'Cache-Control': 'no-store' })
  expect(signed).toHaveBeenCalledWith('p/image.png', 300)
  vi.stubEnv('APP_URL', 'https://local.test/')
  expect(issueScreenshotUrl('p', 'c', 'p/image.png')).toMatch(/^https:\/\/local.test\/api\/v1\/comments\/c\/issue-screenshot\?token=/)
  vi.stubEnv('APP_URL', '')
  expect(issueScreenshotUrl('p', 'c', 'p/image.png')).toMatch(/^https:\/\/crrt.ai\//)
})
it('binds the capability to the project, comment and screenshot bytes location', async () => {
  const token = issueScreenshotToken('p', 'c', 'p/image.png')
  expect(verifyIssueScreenshotToken(token, 'other', 'c', 'p/image.png')).toBe(false)
  expect(verifyIssueScreenshotToken('short', 'p', 'c', 'p/image.png')).toBe(false)
  expect((await request('GET', { commentId: 'c', token: 'x'.repeat(43) })).code).toBe(404)
})
it.each(['linear', 'jira'])('serves a screenshot exported only to %s and revokes it after unlinking', async (provider) => {
  result.data = { ...row, github_issue_url: null, comment_external_work: [{ provider, state: 'created', external_url: 'https://tracker.test/issue' }] }
  expect((await request()).code).toBe(302)
  result.data.comment_external_work = []
  expect((await request()).code).toBe(404)
  result.data.comment_external_work = [{ state: 'creating', external_url: 'https://tracker.test/issue' }, { state: 'created', external_url: null }]
  expect((await request()).code).toBe(404)
})
it.each([null, { ...row, screenshot_storage_path: null }, { ...row, github_issue_url: null }])('revokes access when the comment, screenshot or issue link is removed: %j', async (data) => {
  result.data = data
  expect((await request()).code).toBe(404)
  expect(signed).not.toHaveBeenCalled()
})
it.each([{ commentId: 'c' }, { token: 'bad' }])('rejects incomplete capability requests: %j', async (query) => {
  expect((await request('GET', query)).code).toBe(404)
})
it('fails closed on lookup, signing and configuration failures', async () => {
  result.error = new Error('Offline')
  expect((await request()).code).toBe(500)
  result.error = null
  signed.mockResolvedValue({ error: new Error('Missing image') })
  expect((await request()).code).toBe(500)
  vi.stubEnv('WIDGET_AUTH_SECRET', '')
  expect((await request('GET', { commentId: 'c', token: 'bad' })).code).toBe(500)
})
it('handles preflight and rejects unsupported methods', async () => {
  expect((await request('OPTIONS')).code).toBe(204)
  expect((await request('POST')).code).toBe(405)
})
