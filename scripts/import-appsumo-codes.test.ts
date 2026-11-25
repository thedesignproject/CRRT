import { expect, it, vi } from 'vitest'
import { importAppsumoCodes, parseAppsumoCsv } from './import-appsumo-codes.js'

it('trims, dedupes and keeps case for one code per line', () => {
  expect(parseAppsumoCsv('﻿AbC-1\r\n  abc-1  \n\n"AbC-2"\nAbC-1\n')).toEqual({ codes: ['AbC-1', 'abc-1', 'AbC-2'], duplicates: 1, header: null })
})
it('never imports a header row as a code', () => {
  expect(parseAppsumoCsv('Code\nX1\n')).toEqual({ codes: ['X1'], duplicates: 0, header: 'Code' })
  expect(parseAppsumoCsv('X1\nCode\n').codes).toEqual(['X1', 'Code'])
})
it('rejects files that are not one column of codes', () => {
  expect(() => parseAppsumoCsv('A1,extra\n')).toThrow('Line 1 has more than one column')
  expect(() => parseAppsumoCsv('x'.repeat(129))).toThrow('longer than 128')
})
it('inserts every code in one statement and counts codes that already existed', async () => {
  const existing = new Set(['B'])
  const sql = vi.fn(async (_strings: TemplateStringsArray, codes: string[]) => codes.filter(code => !existing.has(code)).map(code => ({ code })))
  expect(await importAppsumoCodes(sql as never, ['A', 'B', 'C'])).toEqual({ inserted: 2, existing: 1 })
  expect(sql.mock.calls.map(call => call[1])).toEqual([['A', 'B', 'C']])
})
