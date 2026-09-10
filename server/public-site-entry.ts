import { readFileSync } from 'node:fs'
import { createPublicHandler } from './public-site-handler.js'

// This file and public-pages.json are emitted together into one isolated function.
export default createPublicHandler(JSON.parse(readFileSync(new URL('./public-pages.json', import.meta.url), 'utf8')))
