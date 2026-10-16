import type { Preview } from '@storybook/react-vite'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
// Same style stack as apps/dashboard/main.tsx: tokens first, then dashboard overrides and fonts.
import '../branding/crrt/tokens.css'
import '../apps/dashboard/globals.css'
import '@fontsource-variable/figtree/wght.css'

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
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
