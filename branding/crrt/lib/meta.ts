/**
 * Agentic Design System — component meta schema.
 * Source of truth: branding/CRRT-DESIGN-SYSTEM.md § 5.
 *
 * Every `<Component>.meta.ts` file exports a single `meta: ComponentMeta`
 * constant. Agents read these to know how, when, and why to use a component.
 */

export type ComponentCategory =
  | 'action'
  | 'display'
  | 'navigation'
  | 'feedback'
  | 'layout'
  | 'overlay'

export type ComponentStatus = 'stable' | 'beta' | 'experimental' | 'deprecated'

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

export interface FigmaReference {
  fileKey: string
  nodeId: string
  variants?: Record<string, string>
}

export interface ComponentMeta {
  // Identity
  name: string
  displayName: string
  description: string
  category: ComponentCategory
  status: ComponentStatus
  version: string

  // Usage guidance — written for an LLM consumer
  whenToUse: string[]
  whenNotToUse: string[]
  semanticTags: string[]

  // API
  props: PropMeta[]
  events?: EventMeta[]
  slots?: SlotMeta[]

  // Design references
  tokens: string[]
  figma?: FigmaReference

  // Composition
  dependencies: {
    npm?: string[]
    internal?: string[]
    shadcnPrimitives?: string[]
  }

  // Behavior contract
  a11y: {
    role?: string
    keyboard?: Record<string, string>
    ariaPattern?: string
    notes?: string[]
  }
  motion?: {
    respectsReducedMotion: boolean
    transitions: string[]
  }

  // Examples for code generation
  examples: ExampleMeta[]
}
