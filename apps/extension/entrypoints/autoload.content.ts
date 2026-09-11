import { defineContentScript } from 'wxt/utils/define-content-script'
import { mountWidgetIfActive as mountAuthorizedWidget } from './comment'

export async function mountWidgetIfActive() {
  await mountAuthorizedWidget()
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main: async (context) => {
    context.addEventListener(window, 'pageshow', (event) => {
      if (event.persisted) void mountWidgetIfActive()
    })
    await mountWidgetIfActive()
  },
})
