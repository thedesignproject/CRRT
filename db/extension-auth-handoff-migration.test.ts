import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'db/migrations/0023_damp_black_tarantula.sql',
  'utf8',
)
const hardeningMigration = readFileSync(
  'db/migrations/0024_silly_kulan_gath.sql',
  'utf8',
)

describe('extension authentication handoff migration', () => {
  it('stores hashes and bounded metadata without storing browser secrets', () => {
    const table = migration.match(/CREATE TABLE "extension_auth_handoffs" \(([\s\S]*?)\n\);/)?.[1]
    expect(table).toBeTruthy()
    expect(table).toContain('"code_hash" text NOT NULL')
    expect(table).toContain('"state_hash" text NOT NULL')
    expect(table).toContain('"pkce_challenge" text NOT NULL')
    expect(table).not.toMatch(/"(code|state|pkce_verifier|access_token|refresh_token|session)"/)
    expect(migration).toContain('extension_auth_handoffs_code_hash_unique')
    expect(migration).toContain('extension_auth_handoffs_expires_at_idx')
  })

  it('binds each handoff to one Chrome extension redirect and authenticated user', () => {
    expect(migration).toContain('REFERENCES "auth"."users"("id") ON DELETE cascade')
    expect(migration).toContain('"extension_auth_handoffs"."extension_id" ~ \'^[a-p]{32}$\'')
    expect(migration).toContain("'.chromiumapp.org/crrt-auth'")
    expect(migration).toContain('ALTER TABLE "extension_auth_handoffs" ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
  })

  it('requires an allowlisted extension client and caps every grant at five minutes', () => {
    expect(hardeningMigration).toContain('CREATE TABLE "extension_auth_clients"')
    expect(hardeningMigration).toContain('"extension_auth_clients" ENABLE ROW LEVEL SECURITY')
    expect(hardeningMigration).not.toContain('CREATE POLICY')
    expect(hardeningMigration).toContain('REFERENCES "public"."extension_auth_clients"("extension_id") ON DELETE cascade')
    expect(hardeningMigration).toContain('"extension_auth_handoffs_max_lifetime_check"')
    expect(hardeningMigration).toContain("interval '5 minutes'")
  })

  it('atomically consumes exactly one unused, unexpired, fully matching proof', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.consume_extension_auth_handoff')
    expect(migration).toMatch(/UPDATE public\.extension_auth_handoffs[\s\S]*SET consumed_at = now\(\)/)
    expect(migration).toContain('handoff.expires_at > now()')
    expect(migration).toContain('handoff.consumed_at IS NULL')
    expect(migration).toContain('RETURNING handoff.user_id')
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''")
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) FROM PUBLIC')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.consume_extension_auth_handoff(text, text, text, text, text) TO service_role')
  })
})
