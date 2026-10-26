import type { ComponentMeta } from '../lib/meta'

export const demoFrameMeta: ComponentMeta = {
  name: 'DemoFrame', description: 'Product-led frame for live, video, or staged CRRT demonstrations.', status: 'beta', category: 'display',
  whenToUse: ['Use for the primary product demonstration.', 'Use for proof that needs product context.'], whenNotToUse: ['Do not use as decorative browser chrome around plain copy.'],
  semanticTags: ['demo', 'video', 'product'], tokens: ['--card', '--border', '--muted-foreground'], accessibility: ['Controls remain native and content requires its own description.'],
  examples: ['<DemoFrame title="Homepage review" status="Ready for review">…</DemoFrame>'],
}
