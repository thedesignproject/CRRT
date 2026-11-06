import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@chromatic-com/playwright/package.json'))
const { default: official } = await import(pathToFileURL(join(root, 'dist/storybook-config/main.mjs')).href)
export default { ...official, previewAnnotations: [...official.previewAnnotations, fileURLToPath(new URL('./preview.mjs', import.meta.url))] }
