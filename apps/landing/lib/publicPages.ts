import { resourcePath } from '../resources/model.ts'
import { resourceCatalog as resources } from '../resources/catalog.generated.ts'

export const publicPages = [
  { path: '/', title: 'CRRT — Visual feedback that becomes working code changes', description: 'Drop a CRRT on any element, review visual feedback, and hand accepted changes to your coding agent. Humans review the resulting fixes.' },
  { path: '/docs', title: 'CRRT documentation — Install and integrate', description: 'CRRT developer documentation: install the React widget, share accepted feedback with agents, and self-host CRRT.' },
  { path: '/docs/install', title: 'Install CRRT — React widget documentation', description: 'Install the CRRT React widget and connect visual feedback to your project.' },
  { path: '/docs/agent-handoff', title: 'CRRT Agent API — Authentication and developer guide', description: 'CRRT Agent API documentation: scoped share tokens, presence, state, operations, events, and the OpenAPI specification.' },
  { path: '/docs/self-host', title: 'Self-host CRRT — Developer documentation', description: 'Run CRRT with your own frontend, API, and database infrastructure.' },
  { path: '/resources', title: 'Design systems, agent workflows & AI prototyping | CRRT', description: 'Practical guides and tools for designers and founders: review design systems, prototype with AI, and turn visual feedback into reviewed coding-agent fixes.' },
  ...resources.map(resource => ({ path: resourcePath(resource), title: `${resource.seoTitle} | CRRT`, description: resource.description })),
] as const

