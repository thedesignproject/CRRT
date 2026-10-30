import type { ComponentMeta } from '../lib/meta'

export const badgeMeta: ComponentMeta = {
  name: 'Badge', description: 'Compact label for a recommendation, state, or plan distinction.', status: 'beta', category: 'display',
  whenToUse: ['Use for short decision-relevant labels.', 'Use for recommended pricing state.'], whenNotToUse: ['Do not use for sentences or decorative eyebrows.'],
  semanticTags: ['badge', 'status', 'label'], tokens: ['--primary', '--primary-soft'], accessibility: ['Never conveys state through color alone.'],
  examples: ['<Badge>2 months free</Badge>'],
}
