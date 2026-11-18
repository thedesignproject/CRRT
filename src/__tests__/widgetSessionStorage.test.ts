import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readWidgetSession, writeWidgetSession, widgetSessionKey } from '../lib/widgetSessionStorage'
const value = { accessToken: `crrt_widget_${'a'.repeat(43)}`, displayName: 'Ada', expiresAt: '2099-01-01' }
beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
it('persists only a valid, unexpired scoped credential', () => {
  const key = widgetSessionKey('/api', 'one')
  expect(key).not.toBe(widgetSessionKey('/api', 'two'))
  expect(key).not.toBe(widgetSessionKey('https://other.test/api', 'one'))
  writeWidgetSession(key, value); expect(readWidgetSession(key)).toEqual(value)
  writeWidgetSession(key, null); expect(readWidgetSession(key)).toBeNull()
})
it.each([null, {}, { ...value, accessToken: 'dashboard-token' }, { ...value, displayName: 1 }, { ...value, displayName: '' }, { ...value, expiresAt: 1 }, { ...value, expiresAt: 'bad' }, { ...value, expiresAt: '2000-01-01' }])('rejects malformed or expired stored data %#', input => {
  localStorage.setItem('test', JSON.stringify(input)); expect(readWidgetSession('test')).toBeNull()
  expect(localStorage.getItem('test')).toBeNull()
})
it('tolerates corrupt and unavailable browser storage', () => {
  localStorage.setItem('test', '{'); expect(readWidgetSession('test')).toBeNull()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(readWidgetSession('test')).toBeNull()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => writeWidgetSession('test', value)).not.toThrow()
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => writeWidgetSession('test', null)).not.toThrow()
})
