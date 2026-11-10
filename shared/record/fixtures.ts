import type { Manifest } from './contracts'
export const recordingId = 'e358ec24-c2cd-4505-a5c9-cd12186f88b3'
export const artifactId = 'a03d98f1-c66c-4be5-a089-3fed672b92a8'
export const eventId = 'cb04e032-c738-43b1-be0d-e3caa7f19898'
export const captureManifest: Manifest = {
  version: 'record.v1', durationMs: 2000,
  artifacts: [{ id: artifactId, kind: 'screen', mime: 'video/webm', bytes: 1024, sha256: 'a'.repeat(64), offsetMs: 0 }],
  events: [{ id: eventId, sequence: 0, kind: 'mark', atMs: 500,
    mark: { type: 'pin', points: [{ x: 0.5, y: 0.5 }], text: 'Improve this label', pinNumber: 1 },
    target: { selector: '#checkout', pageUrl: 'https://example.test/checkout', tagName: 'button' },
    viewport: { width: 1280, height: 720 }, capture: { width: 1280, height: 720 }, scroll: { x: 0, y: 0 },
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }],
}
export const lifecycleFixtures = ['recording', 'uploading', 'processing', 'ready', 'failed'].map(state => ({
  version: 'record.v1', id: recordingId, title: 'Checkout review', source: 'tab', state,
  projectKey: null, durationMs: state === 'recording' ? null : 2000, markCount: state === 'recording' ? 0 : 1,
  failure: state === 'failed' ? { code: 'record_transcription_failed', stage: 'transcription', retryable: true } : null,
}))
