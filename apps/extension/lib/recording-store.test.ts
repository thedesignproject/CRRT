import { beforeEach, expect, it } from 'vitest'
import type { LocalRecording } from './recording'
import { deleteLocalRecording, getLocalRecording, listLocalRecordings, saveLocalRecording } from './recording-store'

const recording = (id: string, createdAt: string): LocalRecording => ({
  id, createdAt, title: id, source: 'tab', status: 'ready', durationMs: 1_000,
  authorName: 'Tomás', marks: [], transcript: [], transcriptionStatus: 'ready',
})

beforeEach(async () => {
  const existing = await listLocalRecordings()
  await Promise.all(existing.map((item) => deleteLocalRecording(item.id)))
})

it('saves, sorts, reads, and deletes local recordings', async () => {
  await saveLocalRecording(recording('older', '2026-10-23T00:00:00Z'))
  await saveLocalRecording(recording('newer', '2026-10-24T00:00:00Z'))
  expect((await listLocalRecordings()).map((item) => item.id)).toEqual(['newer', 'older'])
  expect((await getLocalRecording('older'))?.title).toBe('older')
  await deleteLocalRecording('older')
  expect(await getLocalRecording('older')).toBeUndefined()
})
