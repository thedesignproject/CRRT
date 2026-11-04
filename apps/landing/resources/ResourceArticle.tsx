import { useState, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { CarrotIcon } from '../components/CarrotIcon'
import { resourceAuthor, resourceDate, resourceMinutes, resourcePath, resourceTracks, type Resource } from './model'
import { resourceCatalog as resources } from './catalog.generated'
import { ResourceRow, ResourceCTA, ResourceSchema } from './resourceElements'

export function ResourceArticle({ resource, tool }: { resource: Resource; tool?: ReactNode }) {
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
        {tool}
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

