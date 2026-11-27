import { describe, expect, it } from 'vitest'
import type { CommentRecord } from '../api'
import { getDisplayStatus, isInactive, mapServerComment } from './comment'
import type { Comment } from './types'

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
      externalWork: [{
        provider: 'linear', externalId: 'issue', externalKey: 'WEB-7', externalUrl: 'https://linear.app/issue/WEB-7',
        lifecycleStatus: 'active', closedAt: null, createdAt: '2026-07-23T12:00:00Z', updatedAt: '2026-07-23T12:00:00Z',
      }],
    }
    expect(mapServerComment(record)).toMatchObject({
      pageUrl: null,
      selector: null,
      x: null,
      y: null,
      author: 'Anonymous',
      externalWork: [expect.objectContaining({ provider: 'linear', externalKey: 'WEB-7' })],
    })
    expect(mapServerComment({
      ...record, selector: '#buy', targetType: 'element_point', anchor: { elementX: .2, elementY: .8 },
    })).toMatchObject({ selector: '#buy', anchor: null })
    const anchor = {
      kind: 'text_range' as const,
      selectedText: 'Feedback',
      normalizedText: 'Feedback',
      prefix: '',
      suffix: '',
      startOffset: 0,
      endOffset: 8,
      containerSelector: '#copy',
      createdFromUrl: '/page',
    }
    expect(mapServerComment({ ...record, targetType: 'text_range', anchor }).anchor).toEqual(anchor)
    expect(mapServerComment({ ...record, targetType: 'text_range', anchor: null }).anchor).toBeNull()
    expect(mapServerComment({
      ...record, targetType: 'text_range', anchor: { elementX: .2, elementY: .8 },
    }).anchor).toBeNull()
  })

  it('keeps agent-ready, testing, and done work in separate queues', () => {
    const base = {
      reviewStatus: 'accepted',
      implementationStatus: 'unassigned',
    } as Comment

    expect(getDisplayStatus(base)).toBe('ready')
    expect(getDisplayStatus({ ...base, implementationStatus: 'ready_for_testing' })).toBe('ready_for_testing')
    const done = { ...base, implementationStatus: 'done' as const }
    expect(getDisplayStatus(done)).toBe('done')
    expect(isInactive(done)).toBe(true)
    expect(isInactive({ ...base, implementationStatus: 'ready_for_testing' })).toBe(false)
  })
})
