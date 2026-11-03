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
      { id: 'prepare-the-input', title: '1. Prepare the input', paragraphs: [item.input + ' Use a named build, realistic fictional data, and the same review conditions when comparing a change. The prefilled values are examples to replace, not facts about your project.'], ...(fields.length ? { items: fields } : {}) },
      { id: 'inspect-the-output', title: '2. Inspect the result', paragraphs: [item.output + ' ' + example + ' Keep the target and the intended decision with the result so a teammate can interpret it without reconstructing the review.'] },
      { id: 'worked-example', title: '3. Adapt the worked example', paragraphs: ['Example: ' + example + ' Replace sample assumptions with values supported by your project. Review a generated record before copying or downloading it; entering a status does not establish that a check was performed.'], code: `${item.name}\nPurpose: ${purpose}\nExample: ${example}\nRecord with output: target, build, state, owner, and actual checks\nScope: ${limit}` },
      { id: 'verify-in-context', title: '4. Verify in the running product', paragraphs: [limit + ' Use the related guide for the surrounding review method. Repeat the relevant task after implementation and preserve the actual result with the accepted feedback. This page keeps entries in browser memory; it does not submit feedback or grant anyone project access.'] },
    ],
    questions: [
      { question: 'Does this tool inspect or change my project?', answer: 'No. It works with inputs you provide on this page. Verify source files, actual consumers, and the running interface through your project workflow.' },
      { question: 'What should I keep with the output?', answer: `Keep the target, version, assumptions, and actual verification evidence. ${limit}` },
    ],
    sources: technical ? [{ label: 'MDN: CSS values and units', href: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Values_and_units' }, { label: 'Design Tokens Community Group: format', href: 'https://www.designtokens.org/tr/2025.10/format/' }] : [{ label: 'CRRT: visual feedback setup', href: 'https://crrt.ai/docs/install' }, { label: 'CRRT: accepted-feedback handoff', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: [topic.slug, briefTopics.find(other => other.id === item.topics[item.topics.length - 1])!.slug].filter((slug,index,all)=>all.indexOf(slug)===index),
  }
})
