import type { Preview } from '@storybook/react-vite'
import '@fontsource/inter/latin.css'
import '@fontsource-variable/figtree/wght.css'
import '../branding/crrt/tokens.css'
import '../src/design-system/styles.css'
const preview: Preview = { tags: ['autodocs'], parameters: { layout: 'centered', a11y: { test: 'todo' } } }
export default preview
