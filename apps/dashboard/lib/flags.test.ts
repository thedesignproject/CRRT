import { expect, it } from 'vitest'
import { directSendEnabled, directSendFlag } from './flags'

it('turns direct send on only for "1"', () => {
  expect(directSendFlag('1')).toBe(true)
  expect(directSendFlag('true')).toBe(false)
  expect(directSendFlag(undefined)).toBe(false)
  expect(directSendEnabled).toBe(false)
})
