import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  casing: 'snake_case',
  dbCredentials: {
    get url() {
      const u = process.env.DATABASE_URL
      if (!u) throw new Error('DATABASE_URL is required for this drizzle-kit command')
      return u
    },
  },
  strict: true,
  verbose: true,
})
