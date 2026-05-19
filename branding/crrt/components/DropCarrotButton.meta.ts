import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'DropCarrotButton',
  displayName: 'Drop Carrot Button',
  description:
    'Primary action pill that picks up the next product power-up — a carrot — and opens the comment composer.',
  category: 'action',
  status: 'beta',
  version: '0.2.0',

  whenToUse: [
    'You need the primary call-to-action for capturing a new piece of visual feedback.',
    'You want a brand-forward pill button that reads as a CTA but not as a system button.',
    'You are composing the expanded state of FeedbackPanel.',
  ],
  whenNotToUse: [
    'You need a generic-purpose button — use the project\'s standard Button instead.',
    'You need a circular trigger; use FeedbackBadge.',
    'You need a destructive action — DropCarrotButton is never destructive.',
  ],
  semanticTags: ['cta', 'button', 'pill', 'carrot', 'primary-action', 'feedback'],

  props: [
    {
      name: 'children',
      type: 'React.ReactNode',
      required: false,
      default: "'Drop a carrot'",
      description: 'Button label. Keep to ~3 words for the pill geometry.',
    },
    {
      name: 'tone',
      type: "'dark' | 'carrot' | 'phosphor'",
      required: false,
      default: "'dark'",
      enum: ['dark', 'carrot', 'phosphor'],
      description:
        'Color treatment. Dark is canonical for the widget; carrot and phosphor are for marketing surfaces.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      required: false,
      default: "'md'",
      enum: ['sm', 'md', 'lg'],
      description: 'Pill height — 32 / 44 / 52 px.',
    },
    {
      name: 'iconPosition',
      type: "'leading' | 'trailing' | 'none'",
      required: false,
      default: "'leading'",
      enum: ['leading', 'trailing', 'none'],
      description: 'Where the carrot icon sits relative to the label.',
    },
    {
      name: 'loading',
      type: 'boolean',
      required: false,
      default: 'false',
      description: 'Replaces the icon with a spinner; sets aria-busy.',
    },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: 'false',
      description: 'Disables interaction; renders at 60% opacity.',
    },
    {
      name: 'logoSrc',
      type: 'string',
      required: false,
      default: "'/branding/design-system-crrt/Frame 11.png'",
      description: 'Path override for the canonical carrot asset.',
    },
    {
      name: 'onClick',
      type: '(e: React.MouseEvent<HTMLButtonElement>) => void',
      required: false,
      description: 'Click handler; typically opens the comment composer.',
    },
  ],

  events: [
    {
      name: 'onClick',
      payload: 'React.MouseEvent<HTMLButtonElement>',
      description: 'Fires on click, Enter, or Space.',
    },
  ],

  slots: [
    {
      name: 'children',
      description: 'Button label content.',
      accepts: 'ReactNode (typically short string)',
    },
  ],

  tokens: [
    '--crrt-bg-deep',
    '--crrt-bg-deep-soft',
    '--crrt-white',
    '--crrt-rule-dark',
    '--crrt-carrot',
    '--crrt-carrot-deep',
    '--crrt-phosphor',
    '--crrt-ink',
    '--crrt-font-sans',
    '--crrt-shadow-pill',
    '--crrt-duration-fast',
    '--crrt-easing-default',
    '--ring',
  ],

  figma: {
    fileKey: 'j6Wuz9emfjcvlTvzGg1ADB',
    nodeId: '22:793',
    variants: {
      'dark-md': 'TBD',
      'carrot-md': 'TBD',
      'phosphor-md': 'TBD',
      'dark-md-loading': 'TBD',
    },
  },

  dependencies: {
    npm: ['react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    internal: [],
    shadcnPrimitives: [],
  },

  a11y: {
    role: 'button',
    ariaPattern: 'button',
    keyboard: {
      Enter: 'Activate.',
      Space: 'Activate.',
      Tab: 'Move focus.',
    },
    notes: [
      'Always renders as <button>; never spread role="button" on a div.',
      'Loading state sets aria-busy and disables the click via pointer-events: none would be too aggressive — rely on consumer to gate.',
      'Label must be visible and meaningful; no icon-only DropCarrotButton variant.',
    ],
  },
  motion: {
    respectsReducedMotion: true,
    transitions: [
      'Hover: translateX(-2px) + background swap, 150ms ease.',
      'Active: scale(0.98).',
      'Loading: 0.8s linear spinner rotation in place of icon.',
    ],
  },

  examples: [
    {
      name: 'Default',
      description: 'Canonical dark pill with leading carrot icon.',
      code: `<DropCarrotButton onClick={() => openComposer()} />`,
    },
    {
      name: 'Custom label',
      description: 'Override the label while keeping the carrot leading icon.',
      code: `<DropCarrotButton onClick={fn}>Leave a note</DropCarrotButton>`,
    },
    {
      name: 'Carrot tone (marketing)',
      description: 'High-emphasis variant for marketing pages.',
      code: `<DropCarrotButton tone="carrot" size="lg">Drop your first carrot</DropCarrotButton>`,
    },
    {
      name: 'Loading',
      description: 'Spinner replaces the icon while a request is in flight.',
      code: `<DropCarrotButton loading>Saving…</DropCarrotButton>`,
    },
  ],
}
