import { getNonPersistentSupabase, getServiceSupabase } from './supabase.js'

export const EXTENSION_HANDOFF_TTL_MS = 5 * 60 * 1000
export const EXTENSION_HANDOFF_RETENTION_MS = 24 * 60 * 60 * 1000

export type ExtensionHandoffRecord = {
  codeHash: string
  stateHash: string
  codeChallenge: string
  userId: string
  extensionId: string
  redirectUri: string
  expiresAt: Date
}

export type ExtensionSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
  user: { id: string; email: string }
}

function databaseError(operation: string): Error {
  return new Error(`Extension authentication ${operation} failed`)
}

export async function createExtensionAuthHandoff(record: ExtensionHandoffRecord): Promise<void> {
  const { error } = await getServiceSupabase().from('extension_auth_handoffs').insert({
    code_hash: record.codeHash,
    state_hash: record.stateHash,
    pkce_challenge: record.codeChallenge,
    user_id: record.userId,
    extension_id: record.extensionId,
    redirect_uri: record.redirectUri,
    expires_at: record.expiresAt.toISOString(),
  })
  if (error) throw databaseError('handoff creation')
}

export async function consumeExtensionAuthHandoff(
  input: Omit<ExtensionHandoffRecord, 'expiresAt' | 'userId'>,
): Promise<string | null> {
  const { data, error } = await getServiceSupabase().rpc('consume_extension_auth_handoff', {
    p_code_hash: input.codeHash,
    p_state_hash: input.stateHash,
    p_pkce_challenge: input.codeChallenge,
    p_extension_id: input.extensionId,
    p_redirect_uri: input.redirectUri,
  })
  if (error) throw databaseError('handoff exchange')
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && typeof (row as { user_id?: unknown }).user_id === 'string'
    ? (row as { user_id: string }).user_id
    : null
}

export async function cleanupExtensionAuthHandoffs(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - EXTENSION_HANDOFF_RETENTION_MS).toISOString()
  const { error } = await getServiceSupabase()
    .from('extension_auth_handoffs')
    .delete()
    .or(`expires_at.lt.${cutoff},consumed_at.lt.${cutoff}`)
  if (error) throw databaseError('handoff cleanup')
}

export async function mintExtensionSession(userId: string): Promise<ExtensionSession> {
  const service = getServiceSupabase()
  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (userError || !email) throw databaseError('session creation')

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkError || !tokenHash) throw databaseError('session creation')

  const { data: verified, error: verificationError } = await getNonPersistentSupabase().auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  const session = verified?.session
  if (
    verificationError
    || !session?.access_token
    || !session.refresh_token
    || session.user.id !== userId
    || session.user.email !== email
  ) throw databaseError('session creation')

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: { id: userId, email },
  }
}
