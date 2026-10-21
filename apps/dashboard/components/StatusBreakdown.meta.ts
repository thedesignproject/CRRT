import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'StatusBreakdown',
  displayName: 'Status breakdown',
  description: 'Compares comment counts across every workflow status as labeled horizontal bars.',
  category: 'display',
  status: 'beta',
  version: '0.1.0',
  whenToUse: [
    'Use this when the user asks where feedback is stuck or how comments split across statuses.',
    'Use this when comparing open, ready, testing, done, and rejected counts at a glance.',
  ],
  whenNotToUse: [
    'Do not use this for a single number — use MetricCard instead.',
    'Do not use this for trends over days — use LineChart instead.',
  ],
  semanticTags: ['status', 'breakdown', 'bar chart', 'distribution', 'pipeline', 'stuck', 'compare', 'split'],
  props: [
    { name: 'counts', type: 'StatusCounts', required: true, description: 'Count for each display status.' },
    { name: 'title', type: 'string', required: false, default: "'Comments by status'", description: 'Caption above the bars.' },
    { name: 'onSelect', type: '(status: DisplayStatus) => void', required: false, description: 'Makes each row a button that opens that status.' },
  ],
  events: [{ name: 'onSelect', payload: 'DisplayStatus', description: 'Fired with the status of the activated row.' }],
  tokens: [
    '--card', '--border', '--foreground', '--muted-foreground', '--accent', '--ring',
    '--status-open', '--status-accepted', '--status-ready-for-testing', '--status-done', '--status-rejected',
  ],
  a11y: {
    role: 'figure',
    keyboard: { Enter: 'Calls onSelect for the focused row', ' ': 'Calls onSelect for the focused row' },
    notes: ['Every bar is direct-labeled with its status name and count, so color is never the only cue.'],
  },
  examples: [
    {
      name: 'Project pipeline',
      description: 'Status split for the current project with click-through rows.',
      code: `<StatusBreakdown counts={{ open: 4, ready: 3, ready_for_testing: 2, done: 9, rejected: 1 }} onSelect={() => {}} />`,
    },
  ],
}
