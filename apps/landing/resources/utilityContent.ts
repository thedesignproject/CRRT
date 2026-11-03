import type { Resource } from './model.ts'
import { briefTopics } from './brief.generated.ts'
import { utilityDefinitions, worksheetSpecs, tableSpecs } from './utilityDefinitions.ts'

export const utilityResources: Resource[] = utilityDefinitions.filter(item => ![2, 6, 18].includes(item.id)).map(item => {
  const [purpose, example, limit] = item.notes
  const fields = worksheetSpecs[item.kind]?.fields.map(([label]) => label) ?? tableSpecs[item.kind]?.columns ?? []
  const topic = briefTopics.find(topic => topic.id === item.topics[0])!
  const technical = item.id <= 10 || item.id === 14 || item.id === 15
  return {
    utilityId: item.id, toolConfig: { name: item.name, purpose, limit, ...(worksheetSpecs[item.kind] ? { fields: worksheetSpecs[item.kind]!.fields } : {}), ...(tableSpecs[item.kind] ? { table: tableSpecs[item.kind] } : {}) }, slug: item.slug, tool: item.kind,
    track: technical ? 'design-systems' : item.id >= 22 && item.id <= 28 ? 'ai-prototyping' : 'agentic-workflows',
    title: item.name, seoTitle: item.name + ': preview, edit, and export',
    description: `${purpose} ${limit}`.slice(0, 155).replace(/\s+\S*$/, '') + '…',
    answer: purpose + ' ' + limit,
    takeaway: purpose,
    sections: [
      { id: 'prepare-the-input', title: '1. Prepare the input', paragraphs: [item.input], ...(fields.length ? { items: fields } : {}) },
      { id: 'inspect-the-output', title: '2. Inspect the result', paragraphs: [item.output] },
      { id: 'worked-example', title: '3. Adapt the worked example', paragraphs: [example], code: `${item.name}\nPurpose: ${purpose}\nExample: ${example}\nRecord with output: target, build, state, owner, and actual checks\nScope: ${limit}` },
      { id: 'verify-in-context', title: '4. Understand the limits', paragraphs: [limit] },
    ],
    questions: [
      { question: `What inputs does ${item.name.toLowerCase()} use?`, answer: item.input },
      { question: 'What are the limits of this result?', answer: limit },
    ],
    sources: technical ? [{ label: 'MDN: CSS values and units', href: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Values_and_units' }, { label: 'Design Tokens Community Group: format', href: 'https://www.designtokens.org/tr/2025.10/format/' }] : [{ label: 'CRRT: visual feedback setup', href: 'https://crrt.ai/docs/install' }, { label: 'CRRT: accepted-feedback handoff', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: [topic.slug, briefTopics.find(other => other.id === item.topics[item.topics.length - 1])!.slug].filter((slug,index,all)=>all.indexOf(slug)===index),
  }
})
