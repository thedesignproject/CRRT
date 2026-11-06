import { ArrowRight } from 'lucide-react'
import { CarrotIcon } from '../components/CarrotIcon'
import { resourcePath, type ResourceSummary } from './model'

export function ResourceRow({ resource, article = false }: { resource: ResourceSummary; article?: boolean }) {
  const Heading = article ? 'h3' : 'h4'
  return <a className="resource-guide" href={resourcePath(resource)}><div><span className="resource-guide-meta">{resource.tool ? 'Interactive tool' : 'Practical guide'} <span>·</span> {resource.minutes} min read</span><Heading>{resource.title}</Heading><p>{resource.takeaway}</p></div><ArrowRight size={20} aria-hidden="true" /></a>
}

export function ResourceCTA() {
  return <section className="resource-cta"><CarrotIcon size={40} /><div><h2>See something off? Ship the fix.</h2><p>Pin the feedback. Give your coding agent the context. Review what comes back.</p></div><a className="ds-button ds-button-primary" href="/docs/install">Try CRRT <ArrowRight size={17} aria-hidden="true" /></a></section>
}

export function ResourceSchema({ value }: { value: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }} />
}
