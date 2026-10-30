import type { ComponentMeta } from '../lib/meta'

export const ctaGroupMeta: ComponentMeta = {
  name: 'CTAGroup', description: 'Pairs one dominant action with one lower-emphasis alternative.', status: 'beta', category: 'layout',
  whenToUse: ['Use in hero and closing conversion moments.', 'Keep the primary action first.'], whenNotToUse: ['Do not place three or more equal actions inside the group.'],
  semanticTags: ['cta', 'actions', 'conversion'], tokens: ['--primary', '--foreground'], accessibility: ['Preserves DOM and focus order.'],
  examples: ['<CTAGroup><Button>Start trial</Button><Button tone="secondary">Add to Chrome</Button></CTAGroup>'],
}
