import type { ComponentMeta } from '../lib/meta'

export const themeToggleMeta: ComponentMeta = {
  name: 'ThemeToggle', description: 'Switches between persisted light and dark themes.', status: 'beta', category: 'action',
  whenToUse: ['Use in persistent navigation.', 'Use wherever the active theme is visible.'],
  whenNotToUse: ['Do not render outside ThemeProvider.'], semanticTags: ['theme', 'light', 'dark'],
  tokens: ['--foreground', '--border', '--ring'], accessibility: ['Accessible name states the destination theme.'],
  examples: ['<ThemeToggle />'],
}
