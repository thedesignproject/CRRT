import { expect, it } from 'vitest'
import { manifestSchema, type Manifest } from '../../../shared/record/contracts'
import { compactRecordingManifest, recordingManifestBytes, RECORDING_MANIFEST_BUDGET } from './recording-manifest'
function fixture(count = 50): Manifest {
  return { version: 'record.v1', durationMs: 1000,
    artifacts: [{ id: crypto.randomUUID(), kind: 'screen', mime: 'video/webm', bytes: 1, sha256: 'a'.repeat(64), offsetMs: 0 }],
    events: Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), sequence: i, atMs: i, kind: 'mark', mark: { type: 'draw', points: Array.from({ length: 2048 }, (_, j) => ({ x: j / 2049, y: (j % 19) / 19 })) } })),
  }
}
it('fits a many-stroke manifest into the actual serialized budget without losing events or artifact identities', () => {
  const input = fixture()
  expect(recordingManifestBytes(input)).toBeGreaterThan(1_048_576)
  const compact = compactRecordingManifest(input)
  expect(recordingManifestBytes(compact)).toBeLessThanOrEqual(RECORDING_MANIFEST_BUDGET)
  expect(manifestSchema.safeParse(compact).success).toBe(true)
  expect(compact.artifacts).toBe(input.artifacts)
  expect(compact.events.map(e => e.id)).toEqual(input.events.map(e => e.id))
  expect(compact.events[0].mark!.points[0]).toEqual(input.events[0].mark!.points[0])
  expect(compact.events[0].mark!.points.slice(-1)[0].x).toBeCloseTo(input.events[0].mark!.points.slice(-1)[0].x, 4)
  expect(input.events[0].mark!.points).toHaveLength(2048)
  expect(compactRecordingManifest(compact)).toBe(compact)
})
it('preserves non-mark events while compacting and fails explicitly for legacy oversized text instead of uploading media first', () => {
  const input = fixture(); input.events.push({ id: crypto.randomUUID(), sequence: 50, atMs: 999, kind: 'route' })
  expect(compactRecordingManifest(input).events[50]).toEqual(input.events[50])
  const text = fixture(500)
  text.events = text.events.map(e => ({ ...e, mark: { type: 'text', text: 'x'.repeat(2000), points: [{ x: .5, y: .5 }] }, target: { selector: 'a'.repeat(2000) } }))
  expect(() => compactRecordingManifest(text)).toThrow('Your local recording is preserved')
})
