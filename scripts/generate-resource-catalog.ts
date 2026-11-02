import { readFile, writeFile } from 'node:fs/promises'
import { resources, resourceMinutes } from '../apps/landing/resources/content.ts'

const catalog = resources.map(({ answer, sections, questions, sources, ...metadata }) => ({
  ...metadata,
  minutes: resourceMinutes({ ...metadata, answer, sections, questions, sources }),
}))
await writeFile(new URL('../apps/landing/resources/catalog.generated.ts', import.meta.url),
  `// Generated from content.ts before builds. Do not edit by hand.\nimport type { ResourceSummary } from './model'\n\nexport const resourceCatalog: ResourceSummary[] = ${JSON.stringify(catalog, null, 2)}\n`)

const llmsPath = new URL('../apps/landing/public/llms.txt', import.meta.url)
const llms = await readFile(llmsPath, 'utf8')
const links = catalog.map(resource => `- [${resource.title}](https://crrt.ai/resources/${resource.slug}): ${resource.takeaway}`).join('\n')
await writeFile(llmsPath, llms.replace(/## Practical resources\n[\s\S]*?\n## Access and formats/,
  `## Practical resources\n\n- [Resource library](https://crrt.ai/resources): Practical guides and interactive tools for designers, founders, and product teams.\n${links}\n\n## Access and formats`))
