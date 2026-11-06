import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { artifactSchema, createSchema, eventSchema, manifestSchema } from './contracts'
const artifact = { id: randomUUID(), kind: 'screen', mime: 'video/webm', bytes: 12, sha256: 'a'.repeat(64), offsetMs: 0 }
const mark = { id: randomUUID(), sequence: 0, atMs: 0, kind: 'mark', mark: { type: 'pin', points: [{ x: 0.2, y: 0.3 }] } }
const manifest = { version: 'record.v1', durationMs: 100, artifacts: [artifact], events: [mark] }
describe('Record capture contract', () => {
  it('validates media roles, normalized geometry, ordered events and immutable manifests', () => {
    expect(manifestSchema.parse(manifest)).toEqual(manifest)
    expect(artifactSchema.safeParse({ ...artifact, kind: 'audio' }).success).toBe(false)
    expect(artifactSchema.safeParse({ ...artifact, kind: 'audio', mime: 'audio/webm' }).success).toBe(true)
    expect(artifactSchema.safeParse({ ...artifact, offsetMs: 1 }).success).toBe(false)
    expect(eventSchema.safeParse({ ...mark, mark: undefined }).success).toBe(false)
    expect(eventSchema.safeParse({ ...mark, kind: 'click' }).success).toBe(false)
    expect(eventSchema.safeParse({ ...mark, kind: 'click', mark: undefined, crop: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }).success).toBe(false)
    expect(eventSchema.safeParse({ ...mark, crop: { x: 0, y: 0.9, width: 0.2, height: 0.2 } }).success).toBe(false)
    expect(eventSchema.safeParse({ ...mark, crop: { x: 0, y: 0, width: 0.2, height: 0.2 } }).success).toBe(true)
    for (const change of [
      { artifacts: [] }, { artifacts: [artifact, { ...artifact, id: randomUUID() }] },
      { artifacts: [{ ...artifact, kind: 'camera' }] }, { artifacts: [{ ...artifact, offsetMs: 100 }] },
      { events: [mark, mark] }, { events: [{ ...mark, sequence: 1 }] }, { events: [{ ...mark, atMs: 101 }] },
      { events: [{ ...mark, atMs: 20 }, { ...mark, id: randomUUID(), sequence: 1, atMs: 10 }] },
    ]) expect(manifestSchema.safeParse({ ...manifest, ...change }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...manifest, events: [] }).success).toBe(true)
    expect(manifestSchema.safeParse({ ...manifest, events: [mark, { ...mark, id: randomUUID(), sequence: 1, atMs: 20 }] }).success).toBe(true)
  })
  it('rejects ad hoc payloads and excessive duration or artifacts', () => {
    expect(createSchema.safeParse({ projectId: 'required?' }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...manifest, durationMs: 3_600_001 }).success).toBe(false)
    expect(artifactSchema.safeParse({ ...artifact, bytes: Number.MAX_SAFE_INTEGER }).success).toBe(false)
    expect(eventSchema.parse({ ...mark, target: { pageUrl: 'https://user:password@example.test/path?token=secret#private' } }).target?.pageUrl).toBe('https://example.test/path')
    expect(eventSchema.parse({ ...mark, target: { pageUrl: 'http://example.test/path' } }).target?.pageUrl).toBe('http://example.test/path')
    expect(eventSchema.safeParse({ ...mark, target: { pageUrl: 'file:///private' } }).success).toBe(false)
    for (const route of ['#/checkout?token=secret', '#!/settings?secret=value']) {
      const sanitized = eventSchema.parse({ ...mark, target: { pageUrl: `https://user:password@example.test/?secret=value${route}` } }).target!.pageUrl!
      expect(sanitized).toBe(`https://example.test/${route.split('?')[0]}`)
      expect(sanitized).not.toContain('secret')
    }
    for (const path of ['//[', '//other-host/path', '/\\[']) {
      expect(eventSchema.parse({ ...mark, target: { pageUrl: `https://example.test/#${path}?secret=value` } }).target?.pageUrl).toBe(`https://example.test/#${path}`)
    }
  })
})
