import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'SeeFeedbackPanel',
  displayName: 'See Feedback Panel',
  description:
    'Pill-headed disclosure that shows a scrollable list of feedback items with a live count rendered in CRT type.',
  category: 'overlay',
  status: 'beta',
  version: '0.2.0',

  whenToUse: [
    'You need to expose the list of unresolved feedback for the current page.',
    'You want a compact header that doubles as both label and unread counter.',
    'You are composing the expanded state of FeedbackPanel.',
  ],
  whenNotToUse: [
    'You need a full triage UI — use the dashboard, not this widget.',
    'You only need a pill button without a list — use DropCarrotButton instead.',
    'You need a modal — this is a non-modal disclosure.',
  ],
  semanticTags: ['list', 'disclosure', 'panel', 'feedback', 'count', 'pill'],

  props: [
    {
      name: 'count',
      type: 'number',
      required: true,
      description: 'Number rendered in the VT323 trailing chip. Zero-padded to two digits.',
    },
    {
      name: 'items',
      type: 'FeedbackItem[]',
      required: false,
      default: '[]',
      description: 'Feedback items rendered when the panel is open. Empty state shown when list is empty.',
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
      description: 'Fires when the disclosure toggles.',
    },
    {
      name: 'emptyLabel',
      type: 'string',
      required: false,
      default: "'No feedback yet.'",
      description: 'Text shown when items is empty.',
    },
    {
      name: 'renderItem',
      type: '(item: FeedbackItem) => React.ReactNode',
      required: false,
      description: 'Override the default row renderer.',
    },
    {
      name: 'align',
      type: "'start' | 'end'",
      required: false,
      default: "'end'",
      enum: ['start', 'end'],
      description: 'Panel alignment relative to the trigger pill.',
    },
    {
      name: 'label',
      type: 'string',
      required: false,
      default: "'See feedback'",
      description: 'Pill label.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      required: false,
      default: "'md'",
      enum: ['sm', 'md', 'lg'],
      description: 'Pill size — matches DropCarrotButton scale.',
    },
    {
      name: 'maxHeight',
      type: 'number',
      required: false,
      default: '480',
      description: 'Max panel height in pixels before vertical scroll.',
    },
  ],

  events: [
    {
      name: 'onOpenChange',
      payload: 'boolean',
      description: 'Fires with the next open state.',
    },
  ],

  slots: [
    {
      name: 'renderItem',
      description: 'Render-prop slot for each row.',
      accepts: '(item: FeedbackItem) => React.ReactNode',
    },
  ],

  tokens: [
    '--crrt-bg-deep',
    '--crrt-bg-deep-soft',
    '--crrt-white',
    '--crrt-ink-faint',
    '--crrt-rule-dark',
    '--crrt-rule-dark-strong',
    '--crrt-carrot',
    '--crrt-font-sans',
    '--crrt-font-crt',
    '--crrt-radius-2xl',
    '--crrt-shadow-pill',
    '--crrt-shadow-md',
    '--crrt-duration-fast',
    '--crrt-easing-default',
    '--ring',
  ],

  figma: {
    fileKey: 'j6Wuz9emfjcvlTvzGg1ADB',
    nodeId: '22:793',
    variants: {
      'pill-closed': 'TBD',
      'pill-open-with-items': 'TBD',
      'pill-open-empty': 'TBD',
    },
  },

  dependencies: {
    npm: ['react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    internal: [],
    shadcnPrimitives: [],
  },

  a11y: {
    role: 'button (trigger) + region (panel)',
    ariaPattern: 'disclosure',
    keyboard: {
      Enter: 'Toggle the panel.',
      Space: 'Toggle the panel.',
      Escape: 'Closes the panel when focus is inside it (handled by parent FeedbackPanel).',
      Tab: 'Move focus through trigger and visible list items.',
    },
    notes: [
      'Trigger uses aria-expanded and aria-controls referencing the panel id.',
      'Panel is role="region" with an aria-label, not a modal.',
      'The CRT count is also exposed via aria-label for screen readers.',
    ],
  },
  motion: {
    respectsReducedMotion: true,
    transitions: [
      'Pill hover: translateX(-2px) + background swap, 150ms ease.',
      'Panel mount/unmount is immediate; parent FeedbackPanel handles staged reveal.',
    ],
  },

  examples: [
    {
      name: 'Default (closed)',
      description: 'Uncontrolled, starts closed.',
      code: `<SeeFeedbackPanel count={4} items={items} />`,
    },
    {
      name: 'Controlled',
      description: 'Drive the open state from parent.',
      code: `<SeeFeedbackPanel
  count={items.length}
  items={items}
  open={open}
  onOpenChange={setOpen}
/>`,
    },
    {
      name: 'Empty state',
      description: 'Shown when items is empty.',
      code: `<SeeFeedbackPanel count={0} items={[]} defaultOpen emptyLabel="Nothing yet — drop a carrot." />`,
    },
    {
      name: 'Custom row',
      description: 'Provide a renderItem to customize each row.',
      code: `<SeeFeedbackPanel
  count={items.length}
  items={items}
  renderItem={(item) => <FeedbackRowCustom key={item.id} {...item} />}
/>`,
    },
  ],
}
