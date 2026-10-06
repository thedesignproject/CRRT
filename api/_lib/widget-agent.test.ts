import { expect, it, vi } from 'vitest'
import { parseWidgetAgentSessionRequest, sendWidgetAgentError, widgetAgentRequestHash } from './widget-agent.js'

const id = '11111111-1111-4111-8111-111111111111'
const requestKey = ['widget', 'test', '0001'].join('-')
const headerKey = ['widget', 'header', '0001'].join('-')

it('parses bounded unique widget Agent requests from body or header', () => {
  const input = { projectKey: 'p', pageUrl: 'https://example.com/page', idempotencyKey: requestKey, commentIds: [id] }
  expect(parseWidgetAgentSessionRequest(input)).toEqual(input)
  expect(parseWidgetAgentSessionRequest({ ...input, idempotencyKey: undefined }, headerKey)).toMatchObject({ idempotencyKey: headerKey })
  expect(parseWidgetAgentSessionRequest({ ...input, idempotencyKey: undefined }, ['invalid'])).toBeNull()
})

it.each([
  null, {},
  { projectKey: '', pageUrl: 'https://example.com', idempotencyKey: requestKey, commentIds: [id] },
  { projectKey: 'p', pageUrl: '', idempotencyKey: requestKey, commentIds: [id] },
  { projectKey: 'p', pageUrl: 'bad', idempotencyKey: requestKey, commentIds: [id] },
  { projectKey: 'p', pageUrl: 'https://example.com', idempotencyKey: 'short', commentIds: [id] },
  { projectKey: 'p', pageUrl: 'https://example.com', idempotencyKey: requestKey, commentIds: [] },
  { projectKey: 'p', pageUrl: 'https://example.com', idempotencyKey: requestKey, commentIds: Array(101).fill(id) },
  { projectKey: 'p', pageUrl: 'https://example.com', idempotencyKey: requestKey, commentIds: ['bad'] },
  { projectKey: 'p', pageUrl: 'https://example.com', idempotencyKey: requestKey, commentIds: [id, id] },
])('rejects malformed widget Agent requests %#', (input) => {
  expect(parseWidgetAgentSessionRequest(input)).toBeNull()
})

it('hashes selection order independently while binding project and page', () => {
  const second = '22222222-2222-4222-8222-222222222222'
  const one = widgetAgentRequestHash({ projectKey: 'p', pageUrl: 'https://example.com/a', commentIds: [id, second] })
  expect(widgetAgentRequestHash({ projectKey: 'p', pageUrl: 'https://example.com/a', commentIds: [second, id] })).toBe(one)
  expect(widgetAgentRequestHash({ projectKey: 'p', pageUrl: 'https://example.com/b', commentIds: [id, second] })).not.toBe(one)
})

it.each([
  ['authentication_required', 401], ['invalid_selection', 409], ['idempotency_conflict', 409], ['error', 500],
  ['project_access_denied', 403], ['forbidden', 403], ['upgrade_required', 402], ['owner_upgrade_required', 402], ['seat_limit_reached', 409],
] as const)('maps %s to a safe machine-readable response', (code, status) => {
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
  sendWidgetAgentError({ headers: {} } as never, res as never, code)
  expect(res.status).toHaveBeenCalledWith(status)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code, error: expect.any(String) }))
})
