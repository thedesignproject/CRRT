import { useId } from 'react'
import type { CaptureEvent } from '../../../shared/record/contracts'

export function RecordingMarks({ events, atMs }: { events: CaptureEvent[]; atMs: number }) {
  const arrow = useId()
  return <svg role="img" aria-label="Recording annotations" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs><marker id={arrow} markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="var(--primary)" /></marker></defs>
    {events.map(event => {
      const age = atMs - event.atMs
      if (!event.mark || age < 0 || age >= 3000) return null
      const mark = event.mark
      const [start, end = start] = mark.points.map(p => ({ x: p.x * 100, y: p.y * 100 }))
      if (!start) return null
      const opacity = Math.min(1, (3000 - age) / 250)
      return <g key={event.id} opacity={opacity} stroke="var(--primary)" strokeWidth=".65" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {mark.type === 'draw' ? <polyline points={mark.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} />
          : mark.type === 'arrow' ? <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={`url(#${arrow})`} />
          : mark.type === 'box' ? <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx="1" />
          : mark.type === 'text' ? <text x={start.x} y={start.y} fill="var(--primary)" stroke="none" fontSize="2.45" fontWeight="700">{mark.text}</text>
          : <><circle cx={start.x} cy={start.y} r="2.5" fill="var(--primary)" /><text x={start.x} y={start.y + .9} fill="var(--primary-foreground)" stroke="none" fontSize="2.65" fontWeight="800" textAnchor="middle">{mark.pinNumber}</text></>}
      </g>
    })}
  </svg>
}
