import { useEffect, useRef } from 'react'
import { branches, exploded, laptop } from '@lucasmarkes/hairline'
import type { ResourceTrack } from './model'

const figures = { 'design-systems': exploded, 'agentic-workflows': branches, 'ai-prototyping': laptop }

/** Use the three figure factories directly, without initializing every React wrapper. */
export function ResourceArtwork({ track }: { track: ResourceTrack }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const figure = figures[track](root.current!, { play: false, intensity: 0.45 })
    return () => figure.destroy()
  }, [track])
  return <div ref={root} style={{ aspectRatio: '5 / 4' }} tabIndex={-1} />
}
