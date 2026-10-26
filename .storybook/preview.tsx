import type { Preview } from '@storybook/react-vite'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { mswHandlers } from './msw-handlers'
// Same style stack as apps/dashboard/main.tsx: tokens first, then dashboard overrides and fonts.
import '../branding/crrt/tokens.css'
import '../apps/dashboard/globals.css'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource/vt323/latin.css'
import './fonts.css'

const preview: Preview = {
  tags: ['autodocs'],
  loaders: [mswLoader()],
  async beforeEach({ msw }) {
    msw.use(...mswHandlers)
  },
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    // Paint the themed surface so docs previews show real light/dark contrast.
    (Story) => (
      <div className="bg-background p-6 font-sans text-foreground">
        <Story />
      </div>
    ),
    withThemeByDataAttribute({
      themes: { dark: 'dark', light: 'light' },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
    }),
  ],
}

export default preview
