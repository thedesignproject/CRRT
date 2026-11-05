// Test-only auth adapter. No credentials or real auth service are used.
const params = new URLSearchParams(location.search)
const session = params.get('auth') === 'out' ? null : {
  access_token: 'visual-token', user: { id: 'mock-user-id', email: 'reviewer@example.test' },
}
async function result() {
  if (params.get('state') === 'auth-busy') return new Promise<never>(() => {})
  return { data: { session, user: { identities: [{}] } }, error: params.get('state') === 'auth-error' ? new Error('Invalid login credentials') : null }
}
export const supabase = { auth: {
  initialize: async () => ({ error: null }),
  getSession: async () => ({ data: { session }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: result, signUp: result, signInWithOtp: result,
  resetPasswordForEmail: result, updateUser: result, signOut: result,
} }
