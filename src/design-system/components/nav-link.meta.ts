import type { ComponentMeta } from '../lib/meta'

export const navLinkMeta: ComponentMeta = {
  name: 'NavLink', description: 'Quiet navigation link with consistent focus and hover behavior.', status: 'beta', category: 'navigation',
  whenToUse: ['Use for page anchors and routes.', 'Use inside compact navigation.'], whenNotToUse: ['Do not use for actions; use Button.'],
  semanticTags: ['navigation', 'link', 'anchor'], tokens: ['--foreground', '--muted-foreground', '--ring'], accessibility: ['Uses a native anchor.'],
  examples: ['<NavLink href="#pricing">Pricing</NavLink>'],
}
