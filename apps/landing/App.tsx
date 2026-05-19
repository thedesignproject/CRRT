import { Hero } from './sections/Hero'
import { Features } from './sections/Features'
import { FakeDashboard } from './sections/FakeDashboard'
import { Closing } from './sections/Closing'

import { FeedbackWidgetCRRT } from '@widget/components/FeedbackWidgetCRRT'

export function App() {
  const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api'
  const projectId = import.meta.env.VITE_PROJECT_KEY ?? 'crrt-landing-draft'

  return (
    <>
      <Hero />
      <Features />
      <FakeDashboard />
      <Closing />
      <FeedbackWidgetCRRT apiBase={apiBase} projectId={projectId} />
    </>
  )
}
