import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { mocksEnabled } from '../lib/mocks'

export interface UseAuthResult {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'mock-user-id',
    email: 'mock@local.dev',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
} as unknown as Session

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(mocksEnabled ? MOCK_SESSION : null)
  const [loading, setLoading] = useState(!mocksEnabled)

  useEffect(() => {
    if (mocksEnabled) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    signOut: async () => {
      if (mocksEnabled) return
      await supabase.auth.signOut()
    },
  }
}
