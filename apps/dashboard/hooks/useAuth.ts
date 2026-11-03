import { useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import posthog, { isPostHogConfigured } from '../../posthog'
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
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (mocksEnabled) return

    function identify(user: User) {
      if (!isPostHogConfigured || identifiedUserId.current === user.id) return
      if (identifiedUserId.current) posthog.reset()
      posthog.identify(user.id, user.email ? { email: user.email } : undefined)
      identifiedUserId.current = user.id
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) identify(data.session.user)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        if (isPostHogConfigured) posthog.reset()
        identifiedUserId.current = null
      } else if (next?.user) {
        identify(next.user)
      }
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
