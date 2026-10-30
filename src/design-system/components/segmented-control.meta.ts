import type { ComponentMeta } from '../lib/meta'

export const segmentedControlMeta: ComponentMeta = {
  name: 'SegmentedControl', description: 'Switches one compact view or pricing dimension without hiding alternatives.', status: 'beta', category: 'action',
  whenToUse: ['Use for monthly versus yearly pricing.', 'Use when every option can be shown at once.'], whenNotToUse: ['Do not use for navigation across unrelated pages.'],
  semanticTags: ['segment', 'toggle', 'billing'], tokens: ['--card', '--foreground', '--border', '--primary'], accessibility: ['Uses grouped native buttons and aria-pressed.'],
  examples: ['<SegmentedControl label="Billing cycle" value="yearly" options={options} onChange={setCycle} />'],
}
