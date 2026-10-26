import type { ComponentMeta } from '../lib/meta'

export const buttonMeta: ComponentMeta = {
  name: 'Button', description: 'Token-bound action control for primary, secondary, and quiet actions.', status: 'beta', category: 'action',
  whenToUse: ['Use for actions that change state or start a flow.', 'Use primary tone for the single dominant action in a region.'],
  whenNotToUse: ['Do not use for navigation; use NavLink instead.'], semanticTags: ['button', 'cta', 'action'],
  tokens: ['--primary', '--foreground', '--border', '--ring'], accessibility: ['Uses a native button and visible focus.'],
  examples: ['<Button>Start 14-day trial</Button>', '<Button tone="secondary">Add to Chrome</Button>'],
}

export const iconButtonMeta: ComponentMeta = {
  name: 'IconButton', description: 'Square icon-only action with a required accessible label.', status: 'beta', category: 'action',
  whenToUse: ['Use for familiar compact actions.', 'Use when adjacent context explains the icon.'],
  whenNotToUse: ['Do not use for unfamiliar actions; use Button with text.'], semanticTags: ['icon', 'button', 'compact'],
  tokens: ['--foreground', '--border', '--ring'], accessibility: ['Requires label and exposes it through aria-label and title.'],
  examples: ['<IconButton label="Switch to dark mode"><Moon /></IconButton>'],
}
