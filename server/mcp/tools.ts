import { discoveryTools } from './feedback.js'
import { contextTools } from './context.js'
import { actionTools } from './actions.js'
import { dashboardTools } from './dashboard.js'
import { dashboardAccessTools } from './dashboard-access.js'
export const tools = [...discoveryTools, ...contextTools, ...actionTools, ...dashboardAccessTools, ...dashboardTools]
