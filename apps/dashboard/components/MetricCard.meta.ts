import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'MetricCard',
  displayName: 'Metric card',
  description: 'Shows one headline number with a label and optional context line.',
  category: 'display',
  status: 'beta',
  version: '0.1.0',
  whenToUse: [
    'Use this when the answer is a single count or total, such as how many comments are unresolved.',
    'Use this when a KPI should link through to the records behind it via onOpen.',
  ],
  whenNotToUse: [
    'Do not use this to compare several statuses side by side — use StatusBreakdown instead.',
    'Do not use this to show change over time — use LineChart instead.',
  ],
  semanticTags: ['metric', 'kpi', 'stat', 'count', 'total', 'how many', 'number', 'summary'],
  props: [
    { name: 'label', type: 'string', required: true, description: 'What the number counts.' },
    { name: 'value', type: 'number', required: true, description: 'The headline number.' },
    { name: 'detail', type: 'string', required: false, description: 'One short line of context under the number.' },
    { name: 'onOpen', type: '() => void', required: false, description: 'Makes the card a button that opens the underlying records.' },
  ],
  events: [{ name: 'onOpen', payload: 'void', description: 'Fired when the card is activated.' }],
  tokens: ['--card', '--border', '--foreground', '--muted-foreground', '--accent', '--ring'],
  a11y: {
    role: 'button when onOpen is set',
    keyboard: { Enter: 'Calls onOpen', ' ': 'Calls onOpen' },
    ariaPattern: 'button',
    notes: ['Without onOpen the card is static text and not focusable.'],
  },
  examples: [
    {
      name: 'Unresolved comments',
      description: 'Headline count that opens the matching comment list.',
      code: `<MetricCard label="Unresolved comments" value={12} detail="Across marketing-site" onOpen={() => {}} />`,
    },
  ],
}
