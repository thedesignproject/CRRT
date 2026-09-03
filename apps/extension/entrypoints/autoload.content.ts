import { defineContentScript } from 'wxt/utils/define-content-script'
import { mountWidget } from './comment'

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main: () => mountWidget(),
})
