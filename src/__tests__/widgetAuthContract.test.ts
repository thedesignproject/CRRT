import { expect, it } from 'vitest'
import { parseWidgetAuthRequest, widgetOrigin } from '../lib/widgetAuthContract'
const valid = { projectKey: 'p', origin: 'https://example.com', state: 'a'.repeat(43), codeChallenge: 'b'.repeat(43) }
it('accepts exact secure origins and local development origins', () => {
  for (const origin of ['https://example.com', 'https://example.com:444', 'http://localhost:3000', 'http://127.0.0.1', 'http://[::1]:3000']) expect(widgetOrigin(origin)).toBe(origin)
  expect(parseWidgetAuthRequest(valid)).toEqual(valid)
})
it('rejects unsafe origins, URL paths, credentials, malformed proofs and missing fields', () => {
  for (const origin of [null, 'null', '', 'http://example.com', 'ftp://localhost', 'https://example.com/', 'https://user@example.com']) expect(widgetOrigin(origin)).toBeNull()
  for (const value of [{}, { ...valid, projectKey: 4 }, { ...valid, projectKey: '' }, { ...valid, projectKey: 'x'.repeat(201) }, { ...valid, origin: '' }, { ...valid, state: 4 }, { ...valid, state: 'bad' }, { ...valid, codeChallenge: 4 }, { ...valid, codeChallenge: 'bad' }]) expect(parseWidgetAuthRequest(value as never)).toBeNull()
})
