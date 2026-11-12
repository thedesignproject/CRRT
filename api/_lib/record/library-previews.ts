import { checked, database, RecordError, summary, type RecordingRow } from './core.js'
import { recordObjectStorage } from './object-storage.js'
import { checkPath } from './storage.js'

export async function librarySummaries(rows: RecordingRow[]) {
  if (!rows.length) return []
  // Only query artifacts belonging to the already authorized owner page.
  const thumbnails = checked(await database().from('recording_artifacts').select('recording_id,path')
    .in('recording_id', rows.map(row => row.id)).eq('kind', 'thumbnail').not('verified_at', 'is', null)) as { recording_id: string; path: string }[]
  return Promise.all(rows.map(async row => {
    const thumbnail = thumbnails.find(artifact => artifact.recording_id === row.id)
    if (!thumbnail) return { ...summary(row), thumbnailUrl: null }
    checkPath(row.id, thumbnail.path)
    const signed = checked(await recordObjectStorage(row).signPlayback(thumbnail.path, 900))
    if (!signed) throw new RecordError('record_unavailable', 503, true)
    return { ...summary(row), thumbnailUrl: signed.signedUrl }
  }))
}
