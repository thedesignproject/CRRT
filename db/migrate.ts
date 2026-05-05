import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dbClient } from './_client.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set; skipping migrations')
  process.exit(0)
}

const { client, db } = dbClient(url)
await migrate(db, { migrationsFolder: './db/migrations' })
await client.end()
console.log('migrations applied')
