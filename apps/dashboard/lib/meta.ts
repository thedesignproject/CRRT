// Agentic Design System schema. See branding/AGENTIC-DESIGN-SYSTEM.md §3.

export interface PropMeta {
  name: string
  type: string
  required: boolean
  default?: string
  description: string
  enum?: string[]
}

export interface EventMeta {
  name: string
  payload: string
  description: string
}

export interface SlotMeta {
  name: string
  description: string
  accepts: string
}

export interface ExampleMeta {
  name: string
  description: string
  code: string
}

export interface ComponentMeta {
  name: string
  displayName: string
  description: string
  category: 'action' | 'display' | 'navigation' | 'feedback' | 'layout' | 'overlay'
  status: 'stable' | 'beta' | 'experimental' | 'deprecated'
  version: string
  whenToUse: string[]
  whenNotToUse: string[]
  semanticTags: string[]
  props: PropMeta[]
  events?: EventMeta[]
  slots?: SlotMeta[]
  tokens: string[]
  figma?: { fileKey: string; nodeId: string; variants?: Record<string, string> }
  dependencies?: { npm?: string[]; internal?: string[]; shadcnPrimitives?: string[] }
  a11y: {
    role?: string
    keyboard?: Record<string, string>
    ariaPattern?: string
    notes?: string[]
  }
  motion?: { respectsReducedMotion: boolean; transitions: string[] }
  examples: ExampleMeta[]
}
