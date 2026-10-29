import type { Manifest } from '../../../shared/record/contracts'
import { boundedRecordingPoints } from './recording'

export const MAX_RECORDING_REQUEST_BYTES = 1_048_576
export const RECORDING_MANIFEST_BUDGET = 900_000
export const recordingManifestBytes = (manifest: Manifest) => new TextEncoder().encode(JSON.stringify(manifest)).length
export function compactRecordingManifest(manifest: Manifest): Manifest {
  if (recordingManifestBytes(manifest) <= RECORDING_MANIFEST_BUDGET) return manifest
  // Budget the complete serialized request, not each stroke independently.
  // Four decimal places retain sub-pixel precision for ordinary desktop capture.
  for (let points = 2048; ; points = Math.max(2, points / 2)) {
    const compact = { ...manifest, events: manifest.events.map(event => event.mark ? { ...event, mark: { ...event.mark,
      points: boundedRecordingPoints(event.mark.points, points).map(p => ({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 })),
    } } : event) }
    if (recordingManifestBytes(compact) <= RECORDING_MANIFEST_BUDGET) return compact
    if (points === 2) throw new Error('This older recording has too much annotation text to upload. Your local recording is preserved.')
  }
}
