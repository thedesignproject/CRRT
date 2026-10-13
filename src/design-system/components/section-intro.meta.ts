import type { ComponentMeta } from '../lib/meta'

export const sectionIntroMeta: ComponentMeta = {
  name: 'SectionIntro', description: 'Editorial heading and optional supporting action for a major page section.', status: 'beta', category: 'layout',
  whenToUse: ['Use once at the start of a major section.', 'Use when the heading needs a short explanation.'], whenNotToUse: ['Do not add a decorative eyebrow by default.'],
  semanticTags: ['section', 'heading', 'intro'], tokens: ['--foreground', '--muted-foreground'], accessibility: ['Uses a semantic heading.'],
  examples: ['<SectionIntro title="Two ways to start" description="Choose the path that fits your product." />'],
}
