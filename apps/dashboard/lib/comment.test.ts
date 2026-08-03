import { describe, expect, it } from 'vitest'
import type { CommentRecord } from '../api'
import { mapServerComment } from './comment'

describe('mapServerComment', () => {
  it('normalizes nullable legacy context for safe dashboard rendering', () => {
    const record: CommentRecord = {
      id: 'comment-1',
      projectId: 'project-1',
      pageUrl: null,
      selector: null,
      x: null,
      y: null,
      body: 'Feedback only',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      createdAt: '2026-07-23T12:00:00Z',
      updatedAt: '2026-07-23T12:00:00Z',
    }
    expect(mapServerComment(record)).toMatchObject({
      pageUrl: null,
      selector: null,
      x: null,
      y: null,
      author: 'Anonymous',
    })
  })
})
