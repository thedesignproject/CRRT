import { useEffect, useRef, useState, type ComponentType } from 'react'
import { ArrowDown, ArrowRight, Search, X } from 'lucide-react'
import { Navigation } from '../components/Navigation'
import { Footer } from '../sections/Footer'
import { CarrotIcon } from '../components/CarrotIcon'
import { applyPublicMetadata } from '../lib/applyPublicMetadata'
import { ResourceFigure } from './ResourceFigure'
import { resourceDate, resourceAuthor, resourceMinutes, resourcePath, resourceTracks, resourceCategories, type Resource, type ResourceSummary, type ResourceToolConfig, type ResourceTrack } from './model'
import { ResourceCatalogContext, useResourceCatalog } from './ResourceCatalogContext'
import { ResourceTool } from './ResourceTool'
import './resources.css'

export function ResourcesPage({ pathname, article, extraTool, catalog: suppliedCatalog }: { pathname: string; article?: Resource; catalog?: ResourceSummary[]; extraTool?: ComponentType<{kind: NonNullable<Resource['tool']>; config?: ResourceToolConfig}> }) {
  const inheritedCatalog = useResourceCatalog()
  const catalog = suppliedCatalog ?? inheritedCatalog
  const path = pathname.replace(/\/+$/, '')
  const resource = article && resourcePath(article) === path ? article : undefined
  useEffect(() => { if (path === '/resources' || resource) applyPublicMetadata({ path, title: resource ? `${resource.seoTitle} | CRRT` : 'Design systems, agent workflows & AI prototyping | CRRT', description: resource ? resource.description : 'Practical guides and tools for designers and founders: review design systems, prototype with AI, and turn visual feedback into reviewed coding-agent fixes.' }) }, [path, resource])

  return <ResourceCatalogContext.Provider value={catalog}><div className="resources-shell">
    <script id="resource-catalog-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(catalog).replace(/</g, '\\u003c') }} />
    {resource && <script id="resource-page-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(resource).replace(/</g, '\\u003c') }} />}
    <a className="resource-skip" href="#resource-main">Skip to content</a>
    <header className="resource-site-header"><Navigation authenticated={false} /></header>
    {path === '/resources' ? <ResourcesIndex /> : resource ? <ResourceArticle resource={resource} extraTool={extraTool} /> : <main id="resource-main" className="resource-not-found"><h1>Guide not found</h1><p>This resource doesn’t exist. Browse the library to find a guide.</p><a href="/resources">Back to resources <ArrowRight size={16} aria-hidden="true" /></a></main>}
    <Footer />
  </div></ResourceCatalogContext.Provider>
}

function ResourcesIndex() {
  const resources = useResourceCatalog()
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const [trackFilter, setTrackFilter] = useState<ResourceTrack | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const normalizedQuery = query.trim().toLowerCase()
  const matches = resources.filter(resource => (trackFilter === 'all' || resource.track === trackFilter)
    && (categoryFilter === 'all' || resource.category === Number(categoryFilter))
    && (kindFilter === 'all' || (kindFilter === 'tools' ? Boolean(resource.tool) : !resource.tool))
    && `${resource.title} ${resource.track.replace(/-/g, ' ')} ${resource.takeaway}`.toLowerCase().includes(normalizedQuery))
  const featured = resources[2]
  const reset = () => { setQuery(''); setTrackFilter('all'); setCategoryFilter('all'); setKindFilter('all') }
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

    <section className="resource-tool-directory" aria-labelledby="resource-tools-title"><div><span className="resource-eyebrow">Use it in your next review</span><h2 id="resource-tools-title">Small tools. Clearer decisions.</h2><p>Check a pair, compare images, or put a correction into words.</p><a className="resource-text-link" href="#library" onClick={() => { reset(); setKindFilter('tools') }}>Browse all {tools.length} tools <ArrowRight size={16} aria-hidden="true" /></a></div><div className="resource-tool-directory-links">{tools.slice(0, 3).map(tool => <a key={tool.slug} href={resourcePath(tool)}><span className="resource-guide-meta">Interactive tool</span><h3>{tool.title}</h3><p>{tool.takeaway}</p><ArrowRight size={18} aria-hidden="true" /></a>)}</div></section>

    <section className="resource-library" id="library" aria-labelledby="library-title">
      <div className="resource-library-heading"><div><span className="resource-eyebrow">A little reading. A better next build.</span><h2 id="library-title">From first draft to shipped.</h2></div><span>{resources.length - tools.length} guides / {tools.length} tools / 3 tracks</span></div>
      <div className="resource-toolbar">
        <div className="resource-filters" aria-label="Filter by topic" role="group">
          <button type="button" aria-pressed={trackFilter === 'all'} onClick={() => setTrackFilter('all')}>All resources <span>{resources.length}</span></button>
          {resourceTracks.map(track => <button type="button" key={track.id} aria-pressed={trackFilter === track.id} onClick={() => setTrackFilter(track.id)}>{track.label}</button>)}
        </div>
        <div className="resource-search"><Search size={16} aria-hidden="true" /><input ref={searchInput} type="search" autoComplete="off" spellCheck={false} data-1p-ignore aria-label="Search resources" placeholder="Find a guide…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => { setQuery(''); searchInput.current!.focus() }} aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}</div>
      </div>
      <div className="resource-topic-controls"><label>Topic<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">All 12 topics</option>{resourceCategories.map((label,index)=><option value={index} key={label}>{label}</option>)}</select></label><label>Resource type<select value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="all">Guides and tools</option><option value="guides">Guides</option><option value="tools">Tools and templates</option></select></label></div>
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

function ResourceRow({ resource, article = false }: { resource: ResourceSummary; article?: boolean }) {
  const Heading = article ? 'h3' : 'h4'
  return <a className="resource-guide" href={resourcePath(resource)}><div><span className="resource-guide-meta">{resource.tool ? 'Interactive tool' : 'Practical guide'} <span>·</span> {resource.minutes} min read</span><Heading>{resource.title}</Heading><p>{resource.takeaway}</p></div><ArrowRight size={20} aria-hidden="true" /></a>
}

function ResourceArticle({ resource, extraTool }: { resource: Resource; extraTool?: ComponentType<{kind: NonNullable<Resource['tool']>; config?: ResourceToolConfig}> }) {
  const resources = useResourceCatalog()
  const track = resourceTracks.find(item => item.id === resource.track)!
  const related = resources.filter(item => resource.related.includes(item.slug))
  return <main id="resource-main" className="resource-article-main">
    <ResourceSchema value={{ '@context': 'https://schema.org', '@type': 'Article', headline: resource.title, description: resource.description, datePublished: resourceDate, dateModified: resourceDate, author: resourceAuthor, publisher: resourceAuthor, mainEntityOfPage: `https://crrt.ai${resourcePath(resource)}`, image: 'https://crrt.ai/resources-og.png', inLanguage: 'en', articleSection: track.label }} />
    {resource.tool && <ResourceSchema value={{ '@context': 'https://schema.org', '@type': 'WebApplication', '@id': `https://crrt.ai${resourcePath(resource)}#interactive-tool`, name: resource.title, description: resource.description, url: `https://crrt.ai${resourcePath(resource)}`, applicationCategory: 'DesignApplication', operatingSystem: 'Web', isAccessibleForFree: true, creator: resourceAuthor }} />}
    <ResourceSchema value={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'CRRT', item: 'https://crrt.ai/' }, { '@type': 'ListItem', position: 2, name: 'Resources', item: 'https://crrt.ai/resources' }, { '@type': 'ListItem', position: 3, name: resource.title, item: `https://crrt.ai${resourcePath(resource)}` }] }} />
    <nav className="resource-breadcrumbs" aria-label="Breadcrumb"><a href="/">CRRT</a><span>/</span><a href="/resources">Resources</a><span>/</span><a href={`/resources#${track.id}`}>{track.label}</a></nav>
    <header className="resource-article-header"><span className="resource-eyebrow">{track.label} / {resource.tool ? 'Interactive tool' : 'Practical guide'}</span><h1>{resource.title}</h1><p>{resource.takeaway}</p><div className="resource-byline"><CarrotIcon size={22} /><a href="/">By CRRT</a><span>·</span><time dateTime={resourceDate}>November 2, 2026</time><span>·</span><span>{resourceMinutes(resource)} min read</span></div></header>
    <div className="resource-article-layout">
      <aside className="resource-toc"><nav aria-label="On this page"><span className="resource-eyebrow">On this page</span>{resource.tool && <a href="#interactive-tool">Use the tool</a>}<a href="#quick-answer">The short answer</a>{resource.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}<a href="#questions">Common questions</a><a href="#sources">Sources & further reading</a></nav><a className="resource-toc-back" href="/resources">← All resources</a></aside>
      <article className="resource-prose">
        {resource.tool && <ResourceTool kind={resource.tool} config={resource.toolConfig} extraTool={extraTool} />}
        <section className="resource-answer" id="quick-answer"><h2>The short answer</h2><p>{resource.answer}</p></section>
        {resource.sections.map(section => <section id={section.id} key={section.id}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.code && <CopyableExample code={section.code} />}{section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}</section>)}
        <section id="questions"><h2>Common questions</h2>{resource.questions.map(item => <div className="resource-question" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}</section>
        <section className="resource-sources" id="sources"><h2>Sources & further reading</h2><ul>{resource.sources.map(source => <li key={source.href}><a href={source.href}>{source.label} <ArrowRight size={14} aria-hidden="true" /></a></li>)}</ul><p>Written with AI assistance. Tool references checked against the linked documentation on November 2, 2026. Examples are starter templates to adapt and review in your own project.</p></section>
      </article>
    </div>
    <section className="resource-related" aria-labelledby="related-heading"><span className="resource-eyebrow">Keep going</span><h2 id="related-heading">Put the next piece in place.</h2>{related.map(item => <ResourceRow article resource={item} key={item.slug} />)}</section>
    <ResourceCTA />
  </main>
}

function CopyableExample({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  async function copy() {
    try { await navigator.clipboard.writeText(code); setStatus('copied') }
    catch { setStatus('error') }
  }
  return <div className="resource-example"><div><span>Copy & adapt</span><button type="button" onClick={copy}>{status === 'copied' ? 'Copied' : 'Copy template'}</button></div><pre tabIndex={0}><code>{code}</code></pre><span className="resource-copy-status" role="status">{status === 'error' ? 'Couldn’t copy. Select the text above to copy it manually.' : status === 'copied' ? 'Template copied to clipboard.' : ''}</span></div>
}

function ResourceCTA() {
  return <section className="resource-cta"><CarrotIcon size={40} /><div><h2>See something off? Ship the fix.</h2><p>Pin the feedback. Give your coding agent the context. Review what comes back.</p></div><a className="ds-button ds-button-primary" href="/docs/install">Try CRRT <ArrowRight size={17} aria-hidden="true" /></a></section>
}

function ResourceSchema({ value }: { value: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }} />
}
