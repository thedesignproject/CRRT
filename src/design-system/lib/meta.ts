export type ComponentMeta = Readonly<{
  name: string
  description: string
  status: 'stable' | 'beta'
  category: 'action' | 'display' | 'navigation' | 'layout'
  whenToUse: readonly string[]
  whenNotToUse: readonly string[]
  semanticTags: readonly string[]
  tokens: readonly string[]
  accessibility: readonly string[]
  examples: readonly string[]
}>
