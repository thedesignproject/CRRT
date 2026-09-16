import { describe, expect, it } from 'vitest'
import { describeEvent } from './format'

function event(eventType: string, payload: Record<string, unknown> = {}) {
  return {
    id: 1,
    shareId: 'share-1',
    commentId: 'comment-1',
    actorType: 'agent',
    actorId: 'agent-1',
    eventType,
    payload,
    createdAt: '2026-09-11T00:00:00.000Z',
  }
}

describe('describeEvent', () => {
  it('describes the new agent completion event as ready for testing', () => {
    expect(describeEvent(event('comment.ready_for_testing', { summary: 'Updated navigation' }))).toEqual({
      kind: 'done',
      text: 'agent-1 ready for testing · Updated navigation',
    })
    expect(describeEvent(event('comment.ready_for_testing'))).toEqual({
      kind: 'done',
      text: 'agent-1 ready for testing',
    })
  })

  it('preserves the historical completed-event wording', () => {
    expect(describeEvent(event('comment.completed'))).toEqual({
      kind: 'done',
      text: 'agent-1 done',
    })
  })
})
