import type { ComponentMeta } from '../lib/meta'

export const surfaceMeta: ComponentMeta = {
  name: 'Surface', description: 'Bounded neutral surface for one cohesive object or interaction.', status: 'beta', category: 'layout',
  whenToUse: ['Use to frame a product demo.', 'Use when content needs separation from the page.'], whenNotToUse: ['Do not wrap every section or nest inside another Surface.'],
  semanticTags: ['surface', 'panel', 'frame'], tokens: ['--card', '--border'], accessibility: ['Does not add unnecessary semantics.'],
  examples: ['<Surface>Product demo</Surface>'],
}
