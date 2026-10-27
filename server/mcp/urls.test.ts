// @vitest-environment node
import { expect, it } from 'vitest'
import { safeUrl } from './urls.js'
it('removes all query and fragment credentials while retaining page paths', () => {
  expect(safeUrl('https://app.test/checkout?view=design&code=secret&signature=secret&session=secret&arbitrary=secret#secret')).toBe('https://app.test/checkout')
  expect(safeUrl('https://app.test/checkout')).toBe('https://app.test/checkout')
  for (const raw of [null, '', 'bad', 'javascript:alert(1)', 'https://user:password@app.test/']) expect(safeUrl(raw)).toBeNull()
})
