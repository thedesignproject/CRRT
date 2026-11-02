import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { resourcePath, resourceTracks } from './model'
import { resourceCatalog as resources } from './catalog.generated'
import './resources.css'

export function ResourcesMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <div className="resources-menu" ref={root}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }}>
      <button ref={trigger} className="ds-nav-link resources-menu-trigger" type="button" aria-expanded={open} aria-controls="resources-navigation" onClick={() => setOpen(value => !value)}>
        Resources <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div id="resources-navigation" className="resources-menu-panel" hidden={!open}>
        <div className="resources-menu-intro">
          <span className="resource-eyebrow">The CRRT field guide</span>
          <p>Build with AI.<br />Keep your taste.</p>
          <div className="resources-menu-tools"><span className="resource-eyebrow">Interactive tools</span>{resources.filter(resource => resource.tool).map(resource => <a key={resource.slug} href={resourcePath(resource)}>{resource.title}</a>)}</div>
          <a href="/resources">Explore all resources <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        {resourceTracks.map(track => <div className="resources-menu-track" key={track.id}>
          <a className="resources-menu-heading" href={`/resources#${track.id}`}>{track.label}</a>
          {resources.filter(resource => resource.track === track.id && !resource.tool).slice(0, 3).map(resource => <a key={resource.slug} href={resourcePath(resource)}>{resource.title}<span>{resource.takeaway}</span></a>)}
          <a className="resource-menu-browse" href={`/resources#${track.id}`}>Browse this track →</a>
        </div>)}
      </div>
    </div>
  )
}
