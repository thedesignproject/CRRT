import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'FeedbackPanel',
  displayName: 'Feedback Panel',
  description:
    'The full CRRT.AI widget composition — a fixed-position floating trigger that reveals DropCarrotButton and SeeFeedbackPanel on hover or click.',
  category: 'overlay',
  status: 'beta',
  version: '0.2.0',

  whenToUse: [
    'You want the complete CRRT.AI feedback experience on a single page.',
    'You want a one-line drop-in widget that wires up trigger, drop, and see-feedback together.',
    'You need a non-blocking floating affordance that anchors to a page corner.',
  ],
  whenNotToUse: [
    'You only need one of the sub-components — import them individually instead.',
    'You need a modal-style feedback flow — use a Dialog, not this widget.',
    'You are rendering server-only content; this component requires client interactivity.',
  ],
  semanticTags: ['widget', 'feedback', 'fab', 'menu', 'orchestrator', 'crrt'],

  props: [
    {
      name: 'count',
      type: 'number',
      required: false,
      default: '0',
      description: 'Forwarded to FeedbackBadge (pulse indicator) and SeeFeedbackPanel (count chip).',
    },
    {
      name: 'items',
      type: 'FeedbackItem[]',
      required: false,
      default: '[]',
      description: 'Forwarded to SeeFeedbackPanel as the list contents.',
    },
    {
      name: 'position',
      type: "'br' | 'bl' | 'tr' | 'tl'",
      required: false,
      default: "'br'",
      enum: ['br', 'bl', 'tr', 'tl'],
      description: 'Page corner anchor.',
    },
    {
      name: 'offset',
      type: 'number',
      required: false,
      default: '24',
      description: 'Distance from the page edge in pixels. Overrides --crrt-space-7 locally.',
    },
    {
      name: 'triggerOn',
      type: "'hover' | 'click'",
      required: false,
      default: "'hover'",
      enum: ['hover', 'click'],
      description:
        'Interaction model. Hover (and focus-within) is the canonical mode. Click is preferred on touch devices.',
    },
    {
      name: 'open',
      type: 'boolean',
      required: false,
      description: 'Controlled open state. Omit for uncontrolled mode.',
    },
    {
      name: 'defaultOpen',
      type: 'boolean',
      required: false,
      default: 'false',
      description: 'Initial open state when uncontrolled.',
    },
    {
      name: 'onOpenChange',
      type: '(open: boolean) => void',
      required: false,
      description: 'Notifies the parent when expansion toggles.',
    },
    {
      name: 'onDrop',
      type: '() => void',
      required: false,
      description: 'Fires when DropCarrotButton is clicked. Typically opens a comment composer.',
    },
    {
      name: 'onOpenFeedback',
      type: '() => void',
      required: false,
      description: 'Fires when SeeFeedbackPanel is expanded.',
    },
    {
      name: 'theme',
      type: "'dark' | 'light' | 'auto'",
      required: false,
      default: "'auto'",
      enum: ['dark', 'light', 'auto'],
      description: 'Theme override. Auto follows [data-theme] on the document.',
    },
    {
      name: 'logoSrc',
      type: 'string',
      required: false,
      description: 'Path override for the canonical carrot asset; forwarded to all sub-components.',
    },
  ],

  events: [
    {
      name: 'onOpenChange',
      payload: 'boolean',
      description: 'Open-state toggle.',
    },
    {
      name: 'onDrop',
      payload: 'void',
      description: 'Drop-a-carrot pressed.',
    },
    {
      name: 'onOpenFeedback',
      payload: 'void',
      description: 'See-feedback pressed.',
    },
  ],

  slots: [],

  tokens: [
    '--crrt-space-7',
    '--crrt-duration-default',
    '--crrt-easing-emphasis',
  ],

  figma: {
    fileKey: 'j6Wuz9emfjcvlTvzGg1ADB',
    nodeId: '22:793',
    variants: {
      'state-closed': 'TBD',
      'state-hover-expanded': 'TBD',
      'state-click-expanded': 'TBD',
    },
  },

  dependencies: {
    npm: ['react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    internal: ['FeedbackBadge', 'DropCarrotButton', 'SeeFeedbackPanel'],
    shadcnPrimitives: [],
  },

  a11y: {
    role: 'menu container',
    ariaPattern: 'menu',
    keyboard: {
      Enter: 'In click-mode, toggles expansion when focus is on the trigger.',
      Space: 'In click-mode, toggles expansion when focus is on the trigger.',
      Escape: 'Collapses the expanded state.',
      Tab: 'Cycles focus: trigger → DropCarrotButton → SeeFeedbackPanel.',
    },
    notes: [
      'Trigger exposes aria-expanded and aria-haspopup="menu".',
      'When triggerOn="hover", focus-within also expands the panel for keyboard users.',
      'Click outside the panel dismisses it in click mode.',
    ],
  },
  motion: {
    respectsReducedMotion: true,
    transitions: [
      'Options rise from translateY(8px) → 0 over 220ms with opacity 0 → 1.',
      'Reduced-motion users see an immediate state swap.',
    ],
  },

  examples: [
    {
      name: 'Default',
      description: 'Hover-driven widget at bottom-right with no unread feedback.',
      code: `<FeedbackPanel onDrop={openComposer} onOpenFeedback={loadFeedback} />`,
    },
    {
      name: 'With feedback list',
      description: 'Populate the list to see the count chip pulse and the panel content.',
      code: `<FeedbackPanel
  count={items.length}
  items={items}
  onDrop={openComposer}
/>`,
    },
    {
      name: 'Click-to-expand (touch friendly)',
      description: 'Use click mode on touch devices where hover is unreliable.',
      code: `<FeedbackPanel triggerOn="click" count={items.length} items={items} />`,
    },
    {
      name: 'Light theme override',
      description: 'Force light theme regardless of document-level [data-theme].',
      code: `<FeedbackPanel theme="light" count={2} items={items} />`,
    },
  ],
}
