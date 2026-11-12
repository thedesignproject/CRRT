import { useState } from 'react'
import { ArrowDown, ArrowRight, Search, X } from 'lucide-react'
import { CarrotIcon } from '../components/CarrotIcon'
import { ResourceFigure } from './ResourceFigure'
import { resourcePath, resourceTracks, type ResourceTrack } from './model'
import { resourceCatalog as resources } from './catalog.generated'
import { ResourceRow, ResourceCTA, ResourceSchema } from './resourceElements'
import './resources.css'

export function ResourcesIndex() {
  const [query, setQuery] = useState('')
  const [trackFilter, setTrackFilter] = useState<ResourceTrack | 'all'>('all')
  const normalizedQuery = query.trim().toLowerCase()
  const matches = resources.filter(resource => (trackFilter === 'all' || resource.track === trackFilter)
    && `${resource.title} ${resource.description} ${resource.track.replace(/-/g, ' ')} ${resource.takeaway}`.toLowerCase().includes(normalizedQuery))
  const featured = resources[2]
  const reset = () => { setQuery(''); setTrackFilter('all') }
  const tools = resources.filter(resource => resource.tool)

  return <main id="resource-main">
    <ResourceSchema value={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'CRRT resources', description: 'Practical guides to design systems, agentic workflows, and AI prototyping for designers, founders, and product teams.', url: 'https://crrt.ai/resources', mainEntity: { '@type': 'ItemList', itemListElement: resources.map((resource, index) => ({ '@type': 'ListItem', position: index + 1, name: resource.title, url: `https://crrt.ai${resourcePath(resource)}` })) } }} />
    <section className="resource-hero">
      <div className="resource-hero-copy">
        <span className="resource-eyebrow"><CarrotIcon size={18} /> The CRRT field guide</span>
        <h1>Build with AI.<br /><span>Keep your taste.</span></h1>
        <p>Practical guides for designers, founders, and product teams turning a good first draft into a product worth shipping.</p>
        <a className="resource-text-link" href="#library">Find your next step <ArrowDown size={17} aria-hidden="true" /></a>
      </div>
      <a className="resource-feature" href={resourcePath(featured)}>
        <div className="resource-feature-art"><ResourceFigure track="agentic-workflows" /><span>Human eye → agent hand</span></div>
        <div className="resource-feature-copy"><span className="resource-eyebrow">Start here · {featured.minutes} min read</span><h2>Better feedback.<br />Better fixes.</h2><p>Give your coding agent the context to get the next change right.</p><span className="resource-text-link">Write actionable feedback <ArrowRight size={17} aria-hidden="true" /></span></div>
      </a>
    </section>

    <nav className="resource-track-nav" aria-label="Learning tracks">
      {resourceTracks.map((track, index) => <a key={track.id} href={`#${track.id}`} onClick={reset}>
        <span className="resource-track-number">0{index + 1}</span><div><strong>{track.label}</strong><span>{track.description}</span></div><ArrowRight size={18} aria-hidden="true" />
      </a>)}
    </nav>

    <section className="resource-tool-directory" aria-labelledby="resource-tools-title"><div><span className="resource-eyebrow">Use it in your next review</span><h2 id="resource-tools-title">Small tools. Clearer decisions.</h2><p>Check a pair, convert a value, or put a correction into words.</p></div><div className="resource-tool-directory-links">{tools.map(tool => <a key={tool.slug} href={resourcePath(tool)}><span className="resource-guide-meta">Interactive tool</span><h3>{tool.title}</h3><p>{tool.takeaway}</p><ArrowRight size={18} aria-hidden="true" /></a>)}</div></section>

    <section className="resource-library" id="library" aria-labelledby="library-title">
      <div className="resource-library-heading"><div><span className="resource-eyebrow">A little reading. A better next build.</span><h2 id="library-title">From first draft to shipped.</h2></div><span>{resources.length - tools.length} guides / {tools.length} tools / 3 tracks</span></div>
      <div className="resource-toolbar">
        <div className="resource-filters" aria-label="Filter by topic" role="group">
          <button type="button" aria-pressed={trackFilter === 'all'} onClick={() => setTrackFilter('all')}>All resources <span>{resources.length}</span></button>
          {resourceTracks.map(track => <button type="button" key={track.id} aria-pressed={trackFilter === track.id} onClick={() => setTrackFilter(track.id)}>{track.label}</button>)}
        </div>
        <div className="resource-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search resources" placeholder="Find a guide…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}</div>
      </div>
      <p className="resource-results" role="status" aria-live="polite">{matches.length} {matches.length === 1 ? 'resource' : 'resources'}{normalizedQuery ? ` matching “${query.trim()}”` : ' to explore'}</p>
      {resourceTracks.map((track, index) => {
        const guides = matches.filter(resource => resource.track === track.id)
        if (!guides.length) return null
        return <section className="resource-track-section" id={track.id} key={track.id} aria-labelledby={`heading-${track.id}`}>
          <div className="resource-track-intro"><span className="resource-eyebrow">Track 0{index + 1}</span><h3 id={`heading-${track.id}`}>{track.label}</h3><p>{track.detail}</p><ResourceFigure track={track.id} /></div>
          <div className="resource-guide-list">{guides.map(resource => <ResourceRow resource={resource} key={resource.slug} />)}</div>
        </section>
      })}
      {!matches.length && <div className="resource-empty"><h3>No resources found</h3><p>Try “tokens”, “feedback”, “contrast”, or “Lovable”.</p><button type="button" className="resource-text-link" onClick={reset}>Clear filters <ArrowRight size={16} aria-hidden="true" /></button></div>}
    </section>
    <ResourceCTA />
  </main>
}

