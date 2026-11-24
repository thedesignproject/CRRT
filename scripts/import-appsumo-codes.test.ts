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
it('inserts in batches inside one transaction and counts codes that already existed', async () => {
  const existing = new Set(['B'])
  const transaction = vi.fn(async (_strings: TemplateStringsArray, batch: string[]) => batch.filter(code => !existing.has(code)).map(code => ({ code })))
  const sql = { begin: vi.fn(async (run: (tx: typeof transaction) => Promise<void>) => run(transaction)) }
  expect(await importAppsumoCodes(sql as never, ['A', 'B', 'C'], 2)).toEqual({ inserted: 2, existing: 1 })
  expect(sql.begin).toHaveBeenCalledTimes(1)
  expect(transaction.mock.calls.map(call => call[1])).toEqual([['A', 'B'], ['C']])
})
