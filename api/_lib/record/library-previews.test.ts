import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn() }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), database: () => ({ from: m.from }) }))
vi.mock('./object-storage.js', () => ({ recordObjectStorage: () => ({ signPlayback: m.sign }) }))
import { librarySummaries } from './library-previews'
const id = 'a84f2f14-4c62-4b7e-9831-b539fb1ddfba'
const path = `8d92519a-1b41-4d91-9004-8154a556d245/${id}/58fccd5a-904b-4665-a90c-d3a99ce18192.jpg`
const row: any = { id, title: 'Review', state: 'ready', storage_provider: 'r2', storage_bucket: 'private-records' }
let query: any
beforeEach(() => {
  vi.clearAllMocks()
  query = { in: vi.fn(() => query), eq: vi.fn(() => query), not: vi.fn().mockResolvedValue({ data: [{ recording_id: id, path }], error: null }) }
  m.from.mockReturnValue({ select: vi.fn(() => query) })
  m.sign.mockResolvedValue({ data: { signedUrl: 'https://private.test/signed' }, error: null })
})
it('signs verified thumbnails only from the authorized page without exposing object paths', async () => {
  expect(await librarySummaries([row, { ...row, id: 'other' }])).toEqual([
    expect.objectContaining({ id, thumbnailUrl: 'https://private.test/signed' }), expect.objectContaining({ id: 'other', thumbnailUrl: null }),
  ])
  expect(query.in).toHaveBeenCalledWith('recording_id', [id, 'other'])
  expect(query.eq).toHaveBeenCalledWith('kind', 'thumbnail')
  expect(query.not).toHaveBeenCalledWith('verified_at', 'is', null)
  expect(m.sign).toHaveBeenCalledWith(path, 900)
  expect(await librarySummaries([])).toEqual([])
})
it('fails closed on invalid storage paths, database outages and missing signing responses', async () => {
  query.not.mockResolvedValueOnce({ data: [{ recording_id: id, path: 'feedback/other.png' }], error: null })
  await expect(librarySummaries([row])).rejects.toThrow('record_artifact_scope')
  query.not.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
  await expect(librarySummaries([row])).rejects.toThrow('record_unavailable')
  m.sign.mockResolvedValueOnce({ data: null, error: null })
  await expect(librarySummaries([row])).rejects.toThrow('record_unavailable')
  m.sign.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
  await expect(librarySummaries([row])).rejects.toThrow('record_unavailable')
})
