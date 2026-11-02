export const resourceTracks = [
  { id: 'design-systems', label: 'Design systems', description: 'Give every screen the same set of rules.', detail: 'Tokens, components, and consistency as your product grows.', figure: 'Exploded' },
  { id: 'agentic-workflows', label: 'Agentic workflows', description: 'Turn a sharp eye into a shipped fix.', detail: 'Clear feedback, bounded changes, and a review you can trust.', figure: 'Branches' },
  { id: 'ai-prototyping', label: 'AI prototyping', description: 'Get past the first good-looking screen.', detail: 'Build and refine real flows with Lovable and v0.', figure: 'Laptop' },
] as const

export type ResourceTrack = typeof resourceTracks[number]['id']
export type ResourceSection = {
  id: string
  title: string
  paragraphs: string[]
  items?: string[]
  code?: string
}
export type Resource = {
  slug: string
  track: ResourceTrack
  title: string
  seoTitle: string
  description: string
  answer: string
  takeaway: string
  sections: ResourceSection[]
  questions: { question: string; answer: string }[]
  sources: { label: string; href: string }[]
  related: string[]
  tool?: 'contrast' | 'units' | 'feedback'
}

export const resourceDate = '2026-11-02'
export const resourceAuthor = { '@type': 'Organization', name: 'CRRT', url: 'https://crrt.ai/' }

export type ResourceSummary = Omit<Resource, 'answer' | 'sections' | 'questions' | 'sources'> & { minutes: number }

export const resourcePath = (resource: Pick<Resource, 'slug'>) => `/resources/${resource.slug}`

export function resourceMinutes(resource: Resource) {
  const text = [resource.answer, ...resource.sections.flatMap(section => [section.title, ...section.paragraphs, ...(section.items ?? []), section.code ?? '']), ...resource.questions.flatMap(item => [item.question, item.answer])].join(' ')
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200))
}
