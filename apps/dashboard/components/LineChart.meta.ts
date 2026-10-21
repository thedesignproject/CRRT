import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'LineChart',
  displayName: 'Line chart',
  description: 'Plots one daily count over a date range with hover and keyboard inspection.',
  category: 'display',
  status: 'beta',
  version: '0.1.0',
  whenToUse: [
    'Use this when the user asks how a count changes over days or weeks, such as comments per day.',
    'Use this when spotting spikes or trends matters more than exact totals.',
    "Use summary='latest' when each day is a snapshot, such as how many comments were open that day.",
  ],
  whenNotToUse: [
    'Do not use this for a single total — use MetricCard instead.',
    'Do not use this to compare statuses at one point in time — use StatusBreakdown instead.',
  ],
  semanticTags: ['line chart', 'trend', 'time series', 'over time', 'daily', 'spike', 'history', 'graph'],
  props: [
    { name: 'title', type: 'string', required: true, description: 'Names the series being plotted.' },
    { name: 'points', type: 'DailyPoint[]', required: true, description: 'One { date, value } per UTC day, oldest first.' },
    { name: 'summary', type: "'total' | 'latest'", required: false, default: "'total'", enum: ['total', 'latest'], description: 'Headline figure: the sum for daily counts, or the last day for snapshots like a backlog.' },
  ],
  tokens: ['--card', '--border', '--muted-foreground', '--primary', '--popover', '--popover-foreground', '--ring'],
  a11y: {
    role: 'img',
    keyboard: { ArrowLeft: 'Inspects the previous day', ArrowRight: 'Inspects the next day' },
    notes: ['A visually hidden table lists every point for screen readers.'],
  },
  examples: [
    {
      name: 'New comments per day',
      description: 'Thirty days of comment volume built with dailyCounts.',
      code: `<LineChart title="New comments, last 30 days" points={dailyCounts(comments.map((c) => c.createdAt), 30)} />`,
    },
  ],
}
