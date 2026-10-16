import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {
      builder: {
        // Keep the widget library build and application environment out of Storybook.
        viteConfigPath: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
      },
    },
  },
  core: { disableTelemetry: true },
  typescript: {
    // Union props (e.g. variant) and JSDoc come through only with the TypeScript docgen.
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      // The root tsconfig only covers the widget; docgen needs a project that includes apps/dashboard.
      tsconfigPath: fileURLToPath(new URL('../tsconfig.check.json', import.meta.url)),
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Document the component's own props, not every inherited HTML attribute.
      propFilter: (prop) => !prop.parent?.fileName.includes('node_modules'),
    },
  },
}

export default config
