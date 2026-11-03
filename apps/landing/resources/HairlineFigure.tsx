import { useEffect, useRef } from 'react'
import { branches, exploded, laptop } from '@lucasmarkes/hairline'
import type { ResourceTrack } from './model'

const mounts = { 'design-systems': exploded, 'agentic-workflows': branches, 'ai-prototyping': laptop }

/** Import only the three vanilla figures, rather than the React registry. */
export default function HairlineFigure({track}:{track:ResourceTrack}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const figure = mounts[track](root.current!, { play: false, intensity: 0.45 })
    return () => figure.destroy()
  }, [track])
  return <div ref={root} tabIndex={-1} style={{aspectRatio:'5 / 4'}}/>
}
