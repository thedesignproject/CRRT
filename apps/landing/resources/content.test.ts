import { expect, it } from 'vitest'
import { resources, resourceMinutes } from './content'
import { resourceCatalog } from './catalog.generated'

it('keeps the generated client catalog consistent with authored content', () => {
  expect(resourceCatalog).toEqual(resources.map(({ answer, sections, questions, sources, ...metadata }) => ({ ...metadata, minutes: resourceMinutes({ ...metadata, answer, sections, questions, sources }) })))
  expect(new Set(resources.map(resource => resource.slug)).size).toBe(resources.length)
  expect(new Set(resources.map(resource => resource.seoTitle)).size).toBe(resources.length)
  const slugs = new Set(resources.map(resource => resource.slug))
  for (const resource of resources) {
    expect(resource.seoTitle).not.toContain('CRRT')
    expect(resource.sources.length).toBeGreaterThanOrEqual(2)
    expect(resource.sections.length).toBeGreaterThanOrEqual(4)
    expect(new Set(resource.sections.map(section => section.id)).size).toBe(resource.sections.length)
    for (const slug of resource.related) { expect(slugs.has(slug)).toBe(true); expect(slug).not.toBe(resource.slug) }
  }
})
