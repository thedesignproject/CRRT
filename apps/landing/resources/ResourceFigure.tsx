import { lazy, Suspense, useEffect, useState } from 'react'
import type { ResourceTrack } from './model'

const figures = {
  'design-systems': lazy(() => import('@lucasmarkes/hairline/react').then(module => ({ default: module.Exploded }))),
  'agentic-workflows': lazy(() => import('@lucasmarkes/hairline/react').then(module => ({ default: module.Branches }))),
  'ai-prototyping': lazy(() => import('@lucasmarkes/hairline/react').then(module => ({ default: module.Laptop }))),
}

/** Decorative, pointer-reactive figures; no idle animation or keyboard stops. */
export function ResourceFigure({ track }: { track: ResourceTrack }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const Figure = figures[track]
  return <div className="resource-figure" aria-hidden="true">{mounted ? <Suspense fallback={<div />}><Figure play={false} intensity={0.45} tabIndex={-1} /></Suspense> : <div />}</div>
}
