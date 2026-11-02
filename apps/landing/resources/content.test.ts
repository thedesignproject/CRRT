import { expect, it } from 'vitest'
import { resources, resourceMinutes } from './content'
import { briefTopics, briefUtilities } from './brief.generated'
import { utilityDefinitions } from './utilityDefinitions'
import { resourceCatalog } from './catalog.generated'

it('keeps the generated client catalog consistent with authored content', () => {
  expect(resourceCatalog).toEqual(resources.map(resource => { const { slug, track, title, takeaway, tool, briefId, utilityId } = resource; return { slug, track, title, takeaway, ...(tool ? { tool } : {}), ...(briefId ? { briefId } : {}), ...(utilityId ? { utilityId } : {}), minutes: resourceMinutes(resource), category: Math.floor(((briefId ?? utilityDefinitions.find(item => item.id === utilityId)!.topics[0]) - 1) / 10) } }))
  expect(new Set(resources.map(resource => resource.slug)).size).toBe(resources.length)
  expect(new Set(resources.map(resource => resource.seoTitle)).size).toBe(resources.length)
  const slugs = new Set(resources.map(resource => resource.slug))
  for (const resource of resources) {
    expect(resource.seoTitle).not.toContain('| CRRT')
    expect(resource.sources.length).toBeGreaterThanOrEqual(2)
    expect(resource.sections.length).toBeGreaterThanOrEqual(4)
    expect(new Set(resource.sections.map(section => section.id)).size).toBe(resource.sections.length)
    for (const slug of resource.related) { expect(slugs.has(slug)).toBe(true); expect(slug).not.toBe(resource.slug) }
  }
})


it('covers every numbered topic and utility from the complete user brief exactly once', () => {
  expect(resources.filter(resource => !resource.tool)).toHaveLength(120)
  expect(resources.filter(resource => resource.tool)).toHaveLength(36)
  expect(resources.filter(resource => resource.briefId).map(resource => resource.briefId).sort((a,b)=>a!-b!)).toEqual(briefTopics.map(topic => topic.id))
  expect(resources.filter(resource => resource.utilityId).map(resource => resource.utilityId).sort((a,b)=>a!-b!)).toEqual(briefUtilities.map(item => item.id))
  for (const topic of briefTopics) expect(resources.find(resource => resource.briefId === topic.id)!.slug).toBe(topic.slug)
})
