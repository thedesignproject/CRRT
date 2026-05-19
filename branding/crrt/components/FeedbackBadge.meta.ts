import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'FeedbackBadge',
  displayName: 'Feedback Badge',
  description:
    'Floating circular trigger that opens the CRRT.AI feedback widget; the pulsing dot indicates power-ups available to collect.',
  category: 'action',
  status: 'beta',
  version: '0.2.0',

  whenToUse: [
    'You need a single anchored entry point for feedback on any page.',
    'You want a notification surface (count + pulse) that does not block content.',
    'The product wants brand presence; the canonical pixel-art carrot doubles as identity.',
  ],
  whenNotToUse: [
    'You need a full button with a text label — use DropCarrotButton instead.',
    'You need a multi-action affordance — wrap the badge inside FeedbackPanel.',
    'The page already has a primary FAB; do not stack two FABs.',
  ],
  semanticTags: ['fab', 'feedback', 'trigger', 'notification', 'badge', 'carrot', 'crrt'],

  props: [
    {
      name: 'count',
      type: 'number',
      required: false,
      description:
        'Unresolved feedback count. When > 0 the indicator dot is shown and pulses; the value is also announced via a sr-only label.',
    },
    {
      name: 'showIndicator',
      type: 'boolean',
      required: false,
      default: 'count > 0',
      description: 'Force-show or hide the indicator dot regardless of count.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      required: false,
      default: "'md'",
      enum: ['sm', 'md', 'lg'],
      description: 'Trigger size — 40px / 56px / 72px square.',
    },
    {
      name: 'position',
      type: "'br' | 'bl' | 'tr' | 'tl' | 'inline'",
      required: false,
      default: "'br'",
      enum: ['br', 'bl', 'tr', 'tl', 'inline'],
      description:
        'Anchor mode. Page-corner values render as fixed-position with 24px page-edge offset; "inline" leaves positioning to the parent.',
    },
    {
      name: 'logoSrc',
      type: 'string',
      required: false,
      default: "'/branding/design-system-crrt/Frame 11.png'",
      description:
        'URL to the canonical pixel-art carrot PNG. Override when bundling for a different asset path (Vite, Next.js public dir, etc.).',
    },
    {
      name: 'alt',
      type: 'string',
      required: false,
      default: "'Open CRRT.AI feedback'",
      description: 'Accessible name fallback when aria-label is not provided.',
    },
    {
      name: 'onClick',
      type: '(e: React.MouseEvent<HTMLButtonElement>) => void',
      required: false,
      description: 'Click handler. Typically opens the feedback panel.',
    },
  ],

  events: [
    {
      name: 'onClick',
      payload: 'React.MouseEvent<HTMLButtonElement>',
      description: 'Fired on click, Enter, or Space.',
    },
  ],

  slots: [],

  tokens: [
    '--background',
    '--ring',
    '--crrt-carrot',
    '--crrt-shadow-trigger',
    '--crrt-shadow-trigger-hover',
    '--crrt-pulse-duration',
    '--crrt-duration-default',
    '--crrt-easing-default',
    '--crrt-easing-emphasis',
    '--crrt-space-7',
  ],

  figma: {
    fileKey: 'j6Wuz9emfjcvlTvzGg1ADB',
    nodeId: '22:793',
    variants: {
      'canonical-default': 'TBD',
      'with-indicator': 'TBD',
      'no-indicator': 'TBD',
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
      Enter: 'Activate (fires onClick).',
      Space: 'Activate (fires onClick).',
      Tab: 'Move focus to or away from the trigger.',
    },
    notes: [
      'Render a visible focus ring (crrt-focus-ring) — required for keyboard users.',
      'The unread count is exposed via a sr-only span; do not rely on the visual dot alone.',
      'The hover rotate/scale gesture is animated; reduced-motion users will not see it.',
    ],
  },
  motion: {
    respectsReducedMotion: true,
    transitions: [
      'Hover: scale(1.06) rotate(-3deg) with 220ms ease.',
      'Active: scale(0.98).',
      'Indicator dot: opacity + scale pulse over 2400ms ease-in-out.',
    ],
  },

  examples: [
    {
      name: 'Default',
      description: 'Floating badge, no unread count.',
      code: `<FeedbackBadge onClick={() => console.log('open')} />`,
    },
    {
      name: 'With unread count',
      description: 'Pulsing indicator appears automatically when count > 0.',
      code: `<FeedbackBadge count={4} onClick={() => openPanel()} />`,
    },
    {
      name: 'Inline (custom anchor)',
      description: 'Disable fixed positioning to embed in a custom container.',
      code: `<div className="relative h-32">
  <FeedbackBadge position="inline" size="sm" count={2} />
</div>`,
    },
    {
      name: 'Custom asset path',
      description: 'Override logoSrc when serving the asset from a different path.',
      code: `<FeedbackBadge logoSrc="/static/crrt.png" count={1} />`,
    },
  ],
}
