import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Hero } from './sections/Hero'
import { DASHBOARD_HREF } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { FakeDashboard } from './sections/FakeDashboard'
import { Closing } from './sections/Closing'
import { Pricing } from './sections/Pricing'
import { ProductAudit } from './sections/ProductAudit'
import { Footer } from './sections/Footer'
import { EasterEgg } from './components/EasterEgg'
import { ScrollRuler } from './components/ScrollRuler'
import { useScrollProgress } from './lib/useScrollProgress'
import { DocsApp } from './docs/DocsApp'
import { ProductAuditWorkspace } from './product-audit/ProductAuditWorkspace'

import { FeedbackWidget } from '@widget/components/FeedbackWidget'
import { supabase } from './lib/supabase'

const DEMO_PROJECT_SESSION_KEY = 'crrt:landing-demo-project-id'
let fallbackProjectId: string | null = null

function createDemoProjectId(prefix: string) {
  const suffix = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}-${suffix}`
}

function getDemoProjectId(prefix: string) {
  try {
    const existing = sessionStorage.getItem(DEMO_PROJECT_SESSION_KEY)
    if (existing) return existing
    const next = createDemoProjectId(prefix)
    sessionStorage.setItem(DEMO_PROJECT_SESSION_KEY, next)
    return next
  } catch {
    fallbackProjectId ??= createDemoProjectId(prefix)
    return fallbackProjectId
  }
}

export function App() {
  const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api'
  const projectId = getDemoProjectId(
    import.meta.env.VITE_PROJECT_KEY ?? import.meta.env.VITE_PROJECT_ID ?? 'crrt-landing-demo',
  )

  // /docs/* shows the docs surface. Anything else renders the marketing site.
  // SSR-safe: location is read only after mount.
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname
  const isDocs = initialPath.startsWith('/docs')
  const isAudit = initialPath.startsWith('/audit/')
  const stayOnMarketing = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('stay') === '1'

  useScrollProgress()

  if (isDocs) {
    return (
      <>
        <DocsApp initialPath={initialPath} />
        <FeedbackWidget apiBase={apiBase} projectId={projectId} />
      </>
    )
  }

  if (isAudit) {
    return <ProductAuditWorkspace />
  }

  return <MarketingSite apiBase={apiBase} projectId={projectId} stayOnMarketing={stayOnMarketing} />
}

function MarketingSite({
  apiBase,
  projectId,
  stayOnMarketing,
}: {
  apiBase: string
  projectId: string
  stayOnMarketing: boolean
}) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !stayOnMarketing) window.location.replace(DASHBOARD_HREF)
  }, [session, stayOnMarketing])

  return (
    <>
      <ScrollRuler />
      <Hero authenticated={Boolean(session)} />
      <HowItWorks />
      <FakeDashboard />
      <ProductAudit />
      <Closing />
      <Pricing />
      <Footer />
      <FeedbackWidget apiBase={apiBase} projectId={projectId} />
      <EasterEgg />
    </>
  )
}
