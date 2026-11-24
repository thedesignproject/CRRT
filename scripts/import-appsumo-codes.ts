import { readFileSync } from 'node:fs'
import postgres from 'postgres'

// Usage: DATABASE_URL=... bun scripts/import-appsumo-codes.ts path/to/codes.csv
// Loads every AppSumo code, including the ones AppSumo keeps for testing.
// Safe to re-run: codes already in the database are skipped, never reset.

export function parseAppsumoCsv(text: string) {
  const codes: string[] = [], seen = new Set<string>()
  let duplicates = 0, header: string | null = null
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    let code = line.trim()
    if (code.startsWith('"') && code.endsWith('"') && code.length >= 2) code = code.slice(1, -1).replaceAll('""', '"').trim()
    if (!code) continue
    if (code.includes(',')) throw new Error(`Line ${index + 1} has more than one column; expected one code per line`)
    if (code.length > 128) throw new Error(`Line ${index + 1} is longer than 128 characters`)
    // A header row must never become a redeemable code.
    if (codes.length === 0 && header === null && /^(codes?|coupons?|licen[cs]es?)$/i.test(code)) { header = code; continue }
    if (seen.has(code)) { duplicates++; continue }
    seen.add(code); codes.push(code)
  }
  return { codes, duplicates, header }
}

export async function importAppsumoCodes(sql: postgres.Sql, codes: string[], batchSize = 1000) {
  let inserted = 0
  await sql.begin(async transaction => {
    for (let start = 0; start < codes.length; start += batchSize) {
      const batch = codes.slice(start, start + batchSize)
      const rows = await transaction`insert into public.appsumo_codes(code) select unnest(${batch}::text[])
        on conflict (code) do nothing returning code`
      inserted += rows.length
    }
  })
  return { inserted, existing: codes.length - inserted }
}

if (import.meta.main) {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: bun scripts/import-appsumo-codes.ts <codes.csv>')
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to import AppSumo codes')
  const { codes, duplicates, header } = parseAppsumoCsv(readFileSync(path, 'utf8'))
  if (codes.length === 0) throw new Error('The CSV has no codes')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const { inserted, existing } = await importAppsumoCodes(sql, codes)
    const [{ total }] = await sql`select count(*)::int as total from public.appsumo_codes`
    if (header) console.log(`Ignored header row: ${header}`)
    console.log(`Read ${codes.length} unique codes (${duplicates} duplicate lines in the file).`)
    console.log(`Inserted: ${inserted}`)
    console.log(`Skipped (already imported): ${existing}`)
    console.log(`Total AppSumo codes in the database: ${total}`)
  } finally { await sql.end() }
}
