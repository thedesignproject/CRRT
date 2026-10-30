import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DASHBOARD_HREF } from './sections/Hero'
import { MarketingPage } from './MarketingPage'
import { EasterEgg } from './components/EasterEgg'
import { useScrollProgress } from './lib/useScrollProgress'
import { DocsApp } from './docs/DocsApp'
import { ProductAuditWorkspace } from './product-audit/ProductAuditWorkspace'
import { PrivacyPage } from './legal/PrivacyPage'
import { SupportPage } from './legal/SupportPage'
import { ThemeProvider } from '../../src/design-system'

import { FeedbackWidget } from '@widget/components/FeedbackWidget'
import { supabase } from './lib/supabase'
import { createDemoComments } from './lib/demoComments'
import type { PersonalComments } from '../../src/components/FeedbackWidget/types'

export function App() {
  return <ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light"><RoutedApp /></ThemeProvider>
}

function RoutedApp() {
  const apiBase = import.meta.env.VITE_API_BASE ?? '/api'
  const [demoComments] = useState(createDemoComments)

  // /docs/* shows the docs surface. Anything else renders the marketing site.
  // SSR-safe: location is read only after mount.
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname
  const publicPath = initialPath.replace(/\/+$/, '')
  const isDocs = initialPath.startsWith('/docs')
  const isAudit = initialPath.startsWith('/audit/')
  const stayOnMarketing = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stay') === '1'

  useScrollProgress()

  if (publicPath === '/privacy') {
    return <PrivacyPage />
  }

  if (publicPath === '/support') {
    return <SupportPage />
  }

  const projectId = 'crrt-landing-demo'

  if (isDocs) {
    return (
      <>
        <DocsApp initialPath={initialPath} />
        <FeedbackWidget apiBase={apiBase} projectId={projectId} personalComments={demoComments} />
      </>
    )
  }

  if (isAudit) {
    return <ProductAuditWorkspace />
  }

  return <MarketingSite apiBase={apiBase} projectId={projectId} stayOnMarketing={stayOnMarketing} demoComments={demoComments} />
}

function MarketingSite({
  apiBase,
  projectId,
  stayOnMarketing,
  demoComments,
}: {
  apiBase: string
  projectId: string
  stayOnMarketing: boolean
  demoComments: PersonalComments
}) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const authClient = supabase
    /* v8 ignore next -- production builds always configure Supabase */
    if (!authClient) return

    void authClient.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = authClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !stayOnMarketing) window.location.replace(DASHBOARD_HREF)
  }, [session, stayOnMarketing])

  return (
    <>
      <MarketingPage authenticated={Boolean(session)} accessToken={session?.access_token} apiBase={apiBase} />
      <FeedbackWidget apiBase={apiBase} projectId={projectId} personalComments={demoComments} />
      <EasterEgg />
    </>
  )
}
