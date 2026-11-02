import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareFeedbackUndo, readFeedbackUndo } from './feedback-undo'
const before = { id:'c', projectId:'p', reviewStatus:'accepted' as const, implementationStatus:'in_progress' as const, claimedByAgentId:'agent' }
beforeEach(() => { vi.stubEnv('WIDGET_AUTH_SECRET','test-key'); vi.useFakeTimers(); vi.setSystemTime(10000) })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
const token = () => prepareFeedbackUndo('u',before)('2026-10-30T12:00:00.123456Z')
it('preserves exact state and version and signs a snapshot independent of later mutation', () => {
 const source = {...before}, sign = prepareFeedbackUndo('u',source)
 source.claimedByAgentId = 'other'
 expect(readFeedbackUndo(sign('version'),'u','p','c')).toMatchObject({claimedByAgentId:'agent',expectedUpdatedAt:'version',implementationStatus:'in_progress'})
 expect(readFeedbackUndo(token(),'u','p','c')?.expectedUpdatedAt).toBe('2026-10-30T12:00:00.123456Z')
})
it.each([['other','p','c'],['u','other','c'],['u','p','other']])('binds undo to actor/project/comment %s %s %s', (actor,project,id) => {
 expect(readFeedbackUndo(token(),actor,project,id)).toBeNull()
})
it('expires after one hour', () => { const t=token();vi.advanceTimersByTime(3600000);expect(readFeedbackUndo(t,'u','p','c')).toBeNull() })
it.each([null, 'x'.repeat(8193), '', 'x', '.x', 'x.', 'x.x.extra', 'x.a', 'x.'+Buffer.alloc(32).toString('base64url')])('rejects malformed or tampered receipts', value => {
 expect(readFeedbackUndo(value,'u','p','c')).toBeNull()
})
it.each(['not json', JSON.stringify({purpose:'other'})])('rejects invalid signed contents', value => {
 const body=Buffer.from(value).toString('base64url'), mac=createHmac('sha256','test-key').update(body).digest('base64url')
 expect(readFeedbackUndo(`${body}.${mac}`,'u','p','c')).toBeNull()
})
it('fails before preparing a mutation when signing is unavailable', () => {
 vi.stubEnv('WIDGET_AUTH_SECRET','')
 expect(() => prepareFeedbackUndo('u',before)).toThrow('not configured')
 expect(() => readFeedbackUndo('x.x','u','p','c')).toThrow('not configured')
})
