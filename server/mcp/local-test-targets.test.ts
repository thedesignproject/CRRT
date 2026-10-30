// @vitest-environment node
import { expect, it } from 'vitest'
import { assertLocalMcpTargets } from './local-test-targets.js'
it('requires both privileged destinations to be local before any fixture work', () => {
  const env = { DATABASE_URL: 'postgres://127.0.0.1:54322/postgres', SUPABASE_URL: 'http://localhost:54321' }
  expect(() => assertLocalMcpTargets(env)).not.toThrow()
  for (const name of ['DATABASE_URL', 'SUPABASE_URL']) {
    for (const value of [undefined, 'invalid', 'https://hosted.example.test', 'ftp://localhost']) {
      expect(() => assertLocalMcpTargets({ ...env, [name]: value })).toThrow(`loopback ${name}`)
    }
  }
  expect(() => assertLocalMcpTargets({ DATABASE_URL: 'postgresql://localhost/db', SUPABASE_URL: 'https://127.0.0.1:54321' })).not.toThrow()
})
