import { Hero } from './sections/Hero'
import { FakeDashboard } from './sections/FakeDashboard'
import { FakeArticle } from './sections/FakeArticle'
import { Closing } from './sections/Closing'

import { FeedbackWidget } from '@widget/components/FeedbackWidget'

export function App() {
  const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api'
  const projectId = import.meta.env.VITE_PROJECT_KEY ?? 'crrt-landing-draft'

  return (
    <>
      <Hero />
      <FakeDashboard />
      <FakeArticle />
      <Closing />
      <FeedbackWidget apiBase={apiBase} projectId={projectId} />
    </>
  )
}
