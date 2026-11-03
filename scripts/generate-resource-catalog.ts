import { readFile, writeFile } from 'node:fs/promises'
import { utilityDefinitions } from '../apps/landing/resources/utilityDefinitions.ts'
import { resources, resourceMinutes } from '../apps/landing/resources/content.ts'

const catalog = resources.map(resource => {
  const { slug, track, title, takeaway, tool, briefId, utilityId } = resource
  return { slug, track, title, takeaway, ...(tool ? { tool } : {}), ...(briefId ? { briefId } : {}), ...(utilityId ? { utilityId } : {}), minutes: resourceMinutes(resource), category: Math.floor(((briefId ?? utilityDefinitions.find(item => item.id === utilityId)!.topics[0]) - 1) / 10) }
})
await writeFile(new URL('../apps/landing/resources/publicResourcePages.generated.ts', import.meta.url),
  `// Generated from authored resources. Server and application metadata only.\nexport const publicResourcePages = ${JSON.stringify(resources.map(resource => ({ path: '/resources/' + resource.slug, title: resource.seoTitle + ' | CRRT', description: resource.description })), null, 2)}\n`)
await writeFile(new URL('../apps/landing/resources/catalog.generated.ts', import.meta.url),
  `// Generated from content.ts before builds. Do not edit by hand.\nimport type { ResourceSummary } from './model'\n\nexport const resourceCatalog: ResourceSummary[] = ${JSON.stringify(catalog, null, 2)}\n`)

const selected = new Set(catalog.filter(item => item.tool).slice(0, 3).map(item => item.slug))
for (const track of ['design-systems', 'agentic-workflows', 'ai-prototyping']) for (const item of catalog.filter(item => item.track === track && !item.tool).slice(0, 3)) selected.add(item.slug)
await writeFile(new URL('../apps/landing/resources/menuCatalog.generated.ts', import.meta.url),
  `// Generated navigation subset; complete catalogs are embedded in route HTML.\nimport type { ResourceSummary } from './model'\nexport const menuCatalog: ResourceSummary[] = ${JSON.stringify(catalog.filter(item => selected.has(item.slug)), null, 2)}\n`)

const llmsPath = new URL('../apps/landing/public/llms.txt', import.meta.url)
const llms = await readFile(llmsPath, 'utf8')
const links = catalog.map(resource => `- [${resource.title}](https://crrt.ai/resources/${resource.slug}): ${resource.takeaway}`).join('\n')
await writeFile(llmsPath, llms.replace(/## Practical resources\n[\s\S]*?\n## Access and formats/,
  `## Practical resources\n\n- [Resource library](https://crrt.ai/resources): Practical guides and interactive tools for designers, founders, and product teams.\n${links}\n\n## Access and formats`))
