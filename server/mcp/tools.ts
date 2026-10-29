import { setupTools } from './setup.js'
import { discoveryTools } from './feedback.js'
import { contextTools } from './context.js'
import { actionTools } from './actions.js'
export const tools = [...setupTools, ...discoveryTools, ...contextTools, ...actionTools]
