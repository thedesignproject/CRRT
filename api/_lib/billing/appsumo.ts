import { getServiceSupabase } from '../supabase.js'

export type AppsumoOutcome = 'redeemed' | 'invalid_code' | 'already_redeemed' | 'already_has_plan' | 'rate_limited'
const OUTCOMES = new Set<AppsumoOutcome>(['redeemed', 'invalid_code', 'already_redeemed', 'already_has_plan', 'rate_limited'])

export class AppsumoRedemptionError extends Error {
  constructor(public readonly status: 400 | 409 | 429 | 503, public readonly code: Exclude<AppsumoOutcome, 'redeemed'> | 'unavailable', message: string) { super(message) }
}

const ERRORS: Record<Exclude<AppsumoOutcome, 'redeemed'>, [400 | 409 | 429, string]> = {
  invalid_code: [400, 'That AppSumo code is not valid. Check it and try again.'],
  already_redeemed: [409, 'That AppSumo code has already been redeemed.'],
  already_has_plan: [409, 'Your account already has an AppSumo lifetime plan.'],
  rate_limited: [429, 'Too many attempts. Try again in an hour.'],
}

// Codes are matched exactly as AppSumo issued them: only surrounding
// whitespace from copy and paste is removed, and case is preserved.
export function normalizeAppsumoCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim()
  return code.length >= 1 && code.length <= 128 ? code : null
}

// The database claims the code and grants the plan in one transaction, and
// counts failed attempts per user for the rate limit.
export async function redeemAppsumoCode(userId: string, input: unknown) {
  const code = normalizeAppsumoCode(input)
  if (!code) throw new AppsumoRedemptionError(400, 'invalid_code', ERRORS.invalid_code[1])
  let result: { data: unknown; error: unknown }
  try { result = await getServiceSupabase().rpc('redeem_appsumo_code', { p_user: userId, p_code: code }) }
  catch { result = { data: null, error: true } }
  if (result.error || !OUTCOMES.has(result.data as AppsumoOutcome)) throw new AppsumoRedemptionError(503, 'unavailable', 'AppSumo redemption is temporarily unavailable.')
  const outcome = result.data as AppsumoOutcome
  if (outcome === 'redeemed') return { redeemed: true as const }
  const [status, message] = ERRORS[outcome]
  throw new AppsumoRedemptionError(status, outcome, message)
}
