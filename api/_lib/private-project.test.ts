import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { protectProjectScreenshots, removeRestrictedNotifications } from './private-project.js'
const row = { id: 'c', image_url: 'https://local.test/storage/v1/object/public/feedback-images/p/a.png', screenshot_storage_path: null }
let db: any, storage: any, query: any
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://local.test')
  query = { not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), then: (yes: any) => Promise.resolve({ data: [row], error: null }).then(yes) }
  storage = { download: vi.fn().mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }), error: null }), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }
  db = { from: vi.fn(() => query), storage: { from: vi.fn(() => storage) } }
  vi.mocked(getServiceSupabase).mockReturnValue(db)
})
it('copies old images, records recovery state, deletes public objects and clears public links', async () => {
  await protectProjectScreenshots('p')
  expect(storage.upload).toHaveBeenCalledWith('widget/p/c', expect.any(Blob), { contentType: 'image/png', upsert: true })
  expect(storage.remove).toHaveBeenCalledWith(['p/a.png'])
  expect(query.update).toHaveBeenCalledWith({ screenshot_storage_path: 'widget/p/c' })
  expect(query.update).toHaveBeenCalledWith({ image_url: null })
})
it('retries removal without copying twice, and skips comments without images', async () => {
  query.then = (yes: any) => Promise.resolve({ data: [{ ...row, screenshot_storage_path: 'protected' }, { image_url: null }], error: null }).then(yes)
  await protectProjectScreenshots('p')
  expect(storage.download).not.toHaveBeenCalled()
  expect(storage.remove).toHaveBeenCalledOnce()
  query.then = (yes: any) => Promise.resolve({ data: null, error: null }).then(yes)
  await protectProjectScreenshots('p')
})
it.each(['https://other.test/a.png', 'https://local.test/unrecognized', 'https://local.test/storage/v1/object/public/feedback-images/other/a.png'])('refuses unsupported image locations: %s', async (image_url) => {
  query.then = (yes: any) => Promise.resolve({ data: [{ ...row, image_url }], error: null }).then(yes)
  await expect(protectProjectScreenshots('p')).rejects.toThrow(/Screenshot/)
  expect(storage.download).not.toHaveBeenCalled()
})
it.each(['download', 'upload', 'remove'] as const)('fails closed on %s errors', async (method) => {
  storage[method].mockResolvedValue({ error: new Error('failed') })
  await expect(protectProjectScreenshots('p')).rejects.toThrow(/Could not/)
})
it.each([0, 1, 2])('fails closed on database error at step %i', async (step) => {
  let call = 0
  query.then = (yes: any) => Promise.resolve({ data: [row], error: call++ === step ? new Error('failed') : null }).then(yes)
  await expect(protectProjectScreenshots('p')).rejects.toThrow(/Could not/)
})
it('rejects a missing download body', async () => {
  storage.download.mockResolvedValue({ data: null, error: null })
  await expect(protectProjectScreenshots('p')).rejects.toThrow('Could not read')
})

it('drains remaining public images without skipping rows when comments are deleted', async () => {
  let call = 0
  query.then = (yes: any) => Promise.resolve({ data: call++ ? [] : Array.from({ length: 100 }, () => ({ image_url: null })), error: null }).then(yes)
  await protectProjectScreenshots('p')
  expect(query.range).toHaveBeenNthCalledWith(2, 0, 99)
  expect(query.not).toHaveBeenCalledWith('image_url', 'is', null)
})
it('removes notifications from non-admins when privacy is tightened', async () => {
  query.neq = vi.fn().mockReturnThis(); query.delete = vi.fn().mockReturnThis(); query.in = vi.fn().mockReturnThis()
  query.then = (yes: any) => Promise.resolve({ data: [{ user_id: 'member' }], error: null }).then(yes)
  await removeRestrictedNotifications('p')
  expect(query.neq).toHaveBeenCalledWith('role', 'admin')
  expect(query.in).toHaveBeenCalledWith('user_id', ['member'])
  expect(query.eq).toHaveBeenCalledWith('payload->>projectKey', 'p')
})
it.each([null, []])('handles no restricted notification recipients: %j', async (data) => {
  query.neq = vi.fn().mockReturnThis()
  query.then = (yes: any) => Promise.resolve({ data, error: null }).then(yes)
  await removeRestrictedNotifications('p')
})
it.each([0, 1])('fails closed on notification database error %i', async (step) => {
  query.neq = vi.fn().mockReturnThis(); query.delete = vi.fn().mockReturnThis(); query.in = vi.fn().mockReturnThis()
  let call = 0
  query.then = (yes: any) => Promise.resolve({ data: [{ user_id: 'member' }], error: call++ === step ? new Error('failed') : null }).then(yes)
  await expect(removeRestrictedNotifications('p')).rejects.toThrow('Could not')
})
