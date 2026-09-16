import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({
  getServiceSupabase: vi.fn(),
  getNonPersistentSupabase: vi.fn(),
}))

import { getNonPersistentSupabase, getServiceSupabase } from './supabase.js'
import {
  EXTENSION_HANDOFF_RETENTION_MS,
  cleanupExtensionAuthHandoffs,
  consumeExtensionAuthHandoff,
  createExtensionAuthHandoff,
  mintExtensionSession,
} from './extension-auth-store.js'

const handoff = {
  codeHash: 'a'.repeat(64),
  stateHash: 'b'.repeat(64),
  codeChallenge: 'c'.repeat(43),
  userId: 'user-1',
  extensionId: 'abcdefghijklmnopabcdefghijklmnop',
  redirectUri: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/crrt-auth',
  expiresAt: new Date('2026-09-10T12:05:00.000Z'),
}

class Query {
  calls: Array<[string, ...unknown[]]> = []
  constructor(private response: unknown) {}
  insert(value: unknown) { this.calls.push(['insert', value]); return this }
  delete() { this.calls.push(['delete']); return this }
  or(value: string) { this.calls.push(['or', value]); return this }
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    return Promise.resolve(this.response).then(resolve, reject)
  }
}

function database(responses: unknown[]) {
  const queries: Query[] = []
  const rpc = vi.fn(async () => responses.shift())
  const from = vi.fn(() => {
    const query = new Query(responses.shift())
    queries.push(query)
    return query
  })
  return { client: { from, rpc }, from, rpc, queries }
}

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReset()
  vi.mocked(getNonPersistentSupabase).mockReset()
})

describe('extension auth handoff store', () => {
  it('creates a bounded record containing hashes rather than raw proofs', async () => {
    const fake = database([{ error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    await createExtensionAuthHandoff(handoff)
    expect(fake.from).toHaveBeenCalledWith('extension_auth_handoffs')
    expect(fake.queries[0]?.calls).toContainEqual(['insert', {
      code_hash: handoff.codeHash,
      state_hash: handoff.stateHash,
      pkce_challenge: handoff.codeChallenge,
      user_id: handoff.userId,
      extension_id: handoff.extensionId,
      redirect_uri: handoff.redirectUri,
      expires_at: handoff.expiresAt.toISOString(),
    }])
    expect(JSON.stringify(fake.queries[0]?.calls)).not.toContain('accessToken')
  })

  it('fails handoff creation without leaking database details', async () => {
    const fake = database([{ error: { message: 'secret database detail' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    const error = await createExtensionAuthHandoff(handoff).catch((cause: unknown) => cause)
    expect(error).toEqual(new Error('Extension authentication handoff creation failed'))
    expect(String(error)).not.toContain('secret database detail')
  })

  it('atomically consumes the stored proof through the guarded RPC', async () => {
    const fake = database([
      { data: [{ user_id: 'user-1' }], error: null },
      { data: { user_id: 'user-2' }, error: null },
      { data: [], error: null },
      { data: 'invalid', error: null },
    ])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    const input = { ...handoff }; delete (input as Partial<typeof handoff>).userId; delete (input as Partial<typeof handoff>).expiresAt
    await expect(consumeExtensionAuthHandoff(input)).resolves.toBe('user-1')
    await expect(consumeExtensionAuthHandoff(input)).resolves.toBe('user-2')
    await expect(consumeExtensionAuthHandoff(input)).resolves.toBeNull()
    await expect(consumeExtensionAuthHandoff(input)).resolves.toBeNull()
    expect(fake.rpc).toHaveBeenCalledWith('consume_extension_auth_handoff', {
      p_code_hash: handoff.codeHash,
      p_state_hash: handoff.stateHash,
      p_pkce_challenge: handoff.codeChallenge,
      p_extension_id: handoff.extensionId,
      p_redirect_uri: handoff.redirectUri,
    })
  })

  it('surfaces a safe exchange failure', async () => {
    const fake = database([{ data: null, error: { message: 'private detail' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    const { userId: _userId, expiresAt: _expiresAt, ...input } = handoff
    await expect(consumeExtensionAuthHandoff(input)).rejects.toThrow('Extension authentication handoff exchange failed')
  })

  it('removes only handoff metadata beyond the retention boundary', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z')
    const cutoff = new Date(now.getTime() - EXTENSION_HANDOFF_RETENTION_MS).toISOString()
    const fake = database([{ error: null }, { error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    await cleanupExtensionAuthHandoffs(now)
    await cleanupExtensionAuthHandoffs()
    expect(fake.queries[0]?.calls).toEqual([
      ['delete'],
      ['or', `expires_at.lt.${cutoff},consumed_at.lt.${cutoff}`],
    ])
    expect(fake.queries[1]?.calls[1]?.[1]).toMatch(/^expires_at\.lt\..+,consumed_at\.lt\..+$/)
  })

  it('surfaces a safe cleanup failure', async () => {
    const fake = database([{ error: { message: 'private detail' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.client as never)
    await expect(cleanupExtensionAuthHandoffs()).rejects.toThrow('Extension authentication handoff cleanup failed')
  })
})

function authClients(options: {
  userError?: unknown
  email?: string
  linkError?: unknown
  tokenHash?: string
  verificationError?: unknown
  session?: Record<string, unknown> | null
}) {
  const user = options.email === undefined ? { id: 'user-1' } : { id: 'user-1', email: options.email }
  const getUserById = vi.fn().mockResolvedValue({ data: { user }, error: options.userError ?? null })
  const generateLink = vi.fn().mockResolvedValue({
    data: { properties: options.tokenHash === undefined ? {} : { hashed_token: options.tokenHash } },
    error: options.linkError ?? null,
  })
  const verifyOtp = vi.fn().mockResolvedValue({
    data: { session: options.session ?? null },
    error: options.verificationError ?? null,
  })
  vi.mocked(getServiceSupabase).mockReturnValue({ auth: { admin: { getUserById, generateLink } } } as never)
  vi.mocked(getNonPersistentSupabase).mockReturnValue({ auth: { verifyOtp } } as never)
  return { getUserById, generateLink, verifyOtp }
}

describe('isolated extension sessions', () => {
  it('mints and verifies a distinct session without returning the generated email token', async () => {
    const session = {
      access_token: 'extension-access', refresh_token: 'extension-refresh', expires_at: 123,
      user: { id: 'user-1', email: 'user@example.com' },
    }
    const clients = authClients({ email: 'user@example.com', tokenHash: 'server-only-token', session })
    await expect(mintExtensionSession('user-1')).resolves.toEqual({
      accessToken: 'extension-access', refreshToken: 'extension-refresh', expiresAt: 123,
      user: { id: 'user-1', email: 'user@example.com' },
    })
    expect(clients.getUserById).toHaveBeenCalledWith('user-1')
    expect(clients.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'user@example.com' })
    expect(clients.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'server-only-token' })
    expect(JSON.stringify(await mintExtensionSession('user-1'))).not.toContain('server-only-token')
  })

  it('returns a nullable expiry when Supabase omits it', async () => {
    authClients({ email: 'user@example.com', tokenHash: 'token', session: {
      access_token: 'a', refresh_token: 'r', user: { id: 'user-1', email: 'user@example.com' },
    } })
    await expect(mintExtensionSession('user-1')).resolves.toMatchObject({ expiresAt: null })
  })

  it.each([
    [{ userError: new Error('down'), email: 'user@example.com' }, 'user lookup'],
    [{}, 'missing email'],
    [{ email: 'user@example.com', linkError: new Error('down'), tokenHash: 'token' }, 'link failure'],
    [{ email: 'user@example.com' }, 'missing generated token'],
    [{ email: 'user@example.com', tokenHash: 'token', verificationError: new Error('down') }, 'verification failure'],
    [{ email: 'user@example.com', tokenHash: 'token', session: { refresh_token: 'r', user: { id: 'user-1', email: 'user@example.com' } } }, 'missing access token'],
    [{ email: 'user@example.com', tokenHash: 'token', session: { access_token: 'a', user: { id: 'user-1', email: 'user@example.com' } } }, 'missing refresh token'],
    [{ email: 'user@example.com', tokenHash: 'token', session: { access_token: 'a', refresh_token: 'r', user: { id: 'other', email: 'user@example.com' } } }, 'wrong user'],
    [{ email: 'user@example.com', tokenHash: 'token', session: { access_token: 'a', refresh_token: 'r', user: { id: 'user-1', email: 'other@example.com' } } }, 'wrong email'],
  ] as const)('fails closed for %s', async (options, _label) => {
    authClients(options)
    await expect(mintExtensionSession('user-1')).rejects.toThrow('Extension authentication session creation failed')
  })
})
