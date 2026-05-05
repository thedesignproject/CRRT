/**
 * Marks 0000_baseline as applied without re-running its DDL.
 * Needed for environments whose schema predates Drizzle — re-running the
 * baseline against an existing schema would fail on duplicate tables.
 * Idempotent. Usage in db/README.md.
 */
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { dbClient } from './_client.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const migrations = readMigrationFiles({ migrationsFolder: './db/migrations' })
if (migrations.length === 0) {
  console.error('no migrations found in ./db/migrations')
  process.exit(1)
}

const baseline = migrations[0]
console.log(`baseline migration: hash=${baseline.hash} folderMillis=${baseline.folderMillis}`)

const { client: sql } = dbClient(url)

await sql`create schema if not exists drizzle`
await sql`
  create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )
`

const existing = await sql`
  select id from drizzle.__drizzle_migrations where hash = ${baseline.hash} limit 1
`
if (existing.length > 0) {
  console.log(`baseline already marked (id=${existing[0]!.id}); nothing to do`)
} else {
  await sql`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${baseline.hash}, ${baseline.folderMillis})
  `
  console.log('baseline marked as applied')
}

await sql.end()
