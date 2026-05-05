import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export function dbClient(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} })
  return { client, db: drizzle(client) }
}
