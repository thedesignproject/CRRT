import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { FakeDashboard } from './sections/FakeDashboard'
import { Closing } from './sections/Closing'
import { Pricing } from './sections/Pricing'
import { Footer } from './sections/Footer'
import { EasterEgg } from './components/EasterEgg'
import { ScrollRuler } from './components/ScrollRuler'
import { useScrollProgress } from './lib/useScrollProgress'

import { FeedbackWidget } from '@widget/components/FeedbackWidget'

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
  const projectId = getDemoProjectId(import.meta.env.VITE_PROJECT_KEY ?? 'crrt-landing-demo')
  useScrollProgress()

  return (
    <>
      <ScrollRuler />
      <Hero />
      <HowItWorks />
      <FakeDashboard />
      <Closing />
      <Pricing />
      <Footer />
      <FeedbackWidget apiBase={apiBase} projectId={projectId} />
      <EasterEgg />
    </>
  )
}
