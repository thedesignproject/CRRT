import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { mountWidgetIfActive } from './comment'

// Reloads keep the tab's activation. Restore pins without reopening comment mode.
export default defineUnlistedScript(() => mountWidgetIfActive(false))
