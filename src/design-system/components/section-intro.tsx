import type { ReactNode } from 'react'

export function SectionIntro({ title, description, aside }: { title: string; description?: string; aside?: ReactNode }) {
  return (
    <header className="ds-section-intro">
      <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {aside ? <div>{aside}</div> : null}
    </header>
  )
}
