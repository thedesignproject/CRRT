import { lazy, Suspense, useEffect, useState } from 'react'
import type { ResourceTrack } from './model'

const Artwork = lazy(() => import('./ResourceArtwork').then(module => ({ default: module.ResourceArtwork })))

/** Decorative, pointer-reactive figures; no idle animation or keyboard stops. */
export function ResourceFigure({ track }: { track: ResourceTrack }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return <div className="resource-figure" aria-hidden="true">{mounted ? <Suspense fallback={<div />}><Artwork track={track} /></Suspense> : <div />}</div>
}
