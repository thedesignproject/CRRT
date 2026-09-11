import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/shares.js', () => ({
  requireAgentShare: vi.fn(async () => ({
    share: {
      id: 'share-1',
      slug: 'slug1234',
      projectId: 'demo-project',
    },
    token: 'token-123',
  })),
}))

vi.mock('../../../../_lib/store.js', () => ({
  applyAgentFeedbackOperation: vi.fn(async () => ({
    outcome: 'applied',
    feedbackEventId: 91,
    comment: {
      id: 'comment-1',
      implementationStatus: 'ready_for_testing',
      claimedByAgentId: 'codex-local',
    },
  })),
  getComment: vi.fn(async () => ({
    id: 'comment-1',
    claimedByAgentId: null,
    implementationStatus: 'in_progress',
  })),
  getOperationKey: vi.fn(async () => null),
  shareContainsComment: vi.fn(async () => true),
}))

import handler from './ops.js'
import {
  applyAgentFeedbackOperation,
  getComment,
} from '../../../../_lib/store.js'

interface MockRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  status(code: number): MockRes
  json(data: unknown): MockRes
  end(): MockRes
  setHeader(key: string, value: string): void
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    query: { slug: 'slug1234' },
    body: {},
    headers: {
      authorization: 'Bearer token-123',
      'x-agent-id': 'codex-local',
      'idempotency-key': 'op-1',
    },
    ...overrides,
  }
}

function mockRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
    end() {
      return this
    },
    setHeader(key, value) {
      this.headers[key] = value
    },
  }
}

const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(getComment).mockResolvedValue({
    id: 'comment-1',
    claimedByAgentId: null,
    implementationStatus: 'in_progress',
  } as never)
  vi.mocked(applyAgentFeedbackOperation).mockReset().mockResolvedValue({
    outcome: 'applied',
    feedbackEventId: 91,
    comment: {
      id: 'comment-1',
      implementationStatus: 'ready_for_testing',
      claimedByAgentId: 'codex-local',
    },
  } as never)
})

describe('api/v1/agent/shares/[slug]/ops', () => {
  it('moves completed agent work to human testing and records the operation key', async () => {
    const res = mockRes()

    await call(mockReq({
      body: {
        op: 'comment.complete',
        commentId: 'comment-1',
        payload: {
          note: 'Shipped the CTA fix.',
        },
      },
    }), res)

    expect(res.statusCode).toBe(200)
    expect(applyAgentFeedbackOperation).toHaveBeenCalledWith({
      shareId: 'share-1',
      commentId: 'comment-1',
      agentId: 'codex-local',
      idempotencyKey: 'op-1',
      operation: 'comment.complete',
      eventType: 'comment.ready_for_testing',
      payload: {
        note: 'Shipped the CTA fix.',
        idempotencyKey: 'op-1',
      },
      implementationStatus: 'ready_for_testing',
    })
    expect(res.body).toEqual(expect.objectContaining({ feedbackEventId: 91 }))
  })

  it('lets agents add notes but not move work out of human testing', async () => {
    vi.mocked(getComment).mockResolvedValue({
      id: 'comment-1',
      claimedByAgentId: 'codex-local',
      implementationStatus: 'ready_for_testing',
    } as never)

    let res = mockRes()
    await call(mockReq({ body: { op: 'comment.reopen', commentId: 'comment-1' } }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual(expect.objectContaining({ error: 'Comment status can only be changed by a human reviewer' }))
    expect(applyAgentFeedbackOperation).not.toHaveBeenCalled()

    res = mockRes()
    await call(mockReq({
      headers: {
        authorization: 'Bearer token-123',
        'x-agent-id': 'codex-local',
        'idempotency-key': 'op-2',
      },
      body: { op: 'comment.note', commentId: 'comment-1' },
    }), res)
    expect(res.statusCode).toBe(200)
    expect(applyAgentFeedbackOperation).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'comment.noted',
      implementationStatus: undefined,
    }))

    vi.mocked(getComment).mockResolvedValue({
      id: 'comment-1',
      claimedByAgentId: 'codex-local',
      implementationStatus: 'done',
    } as never)
    res = mockRes()
    await call(mockReq({
      headers: {
        authorization: 'Bearer token-123',
        'x-agent-id': 'codex-local',
        'idempotency-key': 'op-3',
      },
      body: { op: 'comment.complete', commentId: 'comment-1' },
    }), res)
    expect(res.statusCode).toBe(409)
  })

  it('does not overwrite a terminal status set while an agent operation is in flight', async () => {
    vi.mocked(applyAgentFeedbackOperation).mockResolvedValue({
      outcome: 'reviewer_owned', feedbackEventId: null, comment: null,
    })
    const res = mockRes()

    await call(mockReq({
      body: { op: 'comment.complete', commentId: 'comment-1' },
    }), res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual(expect.objectContaining({ error: 'Comment status can only be changed by a human reviewer' }))
  })

  it.each([
    ['duplicate', 200, true],
    ['not_found', 404, undefined],
    ['claimed_conflict', 409, undefined],
  ] as const)('handles an atomic %s result', async (outcome, status, duplicate) => {
    vi.mocked(applyAgentFeedbackOperation).mockResolvedValue({
      outcome, feedbackEventId: outcome === 'duplicate' ? 91 : null, comment: null,
    })
    const res = mockRes()

    await call(mockReq({ body: { op: 'comment.start', commentId: 'comment-1' } }), res)

    expect(res.statusCode).toBe(status)
    if (duplicate) expect(res.body).toEqual(expect.objectContaining({ duplicate: true, feedbackEventId: 91 }))
  })
})
