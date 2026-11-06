import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Navigation } from '../components/Navigation'
import { Footer } from '../sections/Footer'
import { resourcePath, type Resource } from './model'
import './resources.css'

export function ResourcesPage({ pathname, article, children }: { pathname: string; article?: Resource; children?: ReactNode }) {
  const path = pathname.replace(/\/+$/, '')
  const resource = article && resourcePath(article) === path ? article : undefined
  // Resource links load prerendered documents, including their route metadata.

  return <div className="resources-shell">
    {resource && <script id="resource-page-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(resource).replace(/</g, '\\u003c') }} />}
    <a className="resource-skip" href="#resource-main">Skip to content</a>
    <header className="resource-site-header"><Navigation authenticated={false} /></header>
    {path === '/resources' || resource ? children : <main id="resource-main" className="resource-not-found"><h1>Guide not found</h1><p>This resource doesn’t exist. Browse the library to find a guide.</p><a href="/resources">Back to resources <ArrowRight size={16} aria-hidden="true" /></a></main>}
    <Footer />
  </div>
}
