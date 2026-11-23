// The visual-test harness plus the in-memory mock API (local experiment).
// PORT picks the port so a failing-API server can run beside a healthy one.
import { mergeConfig } from 'vite'
import base from '../tests/visual/harness/vite.config'
import { mockApi } from './mock-api'

const port = Number(process.env.PORT ?? 4390)

// Publishes the mock server's comment state into a hidden element so Bombadil
// rules can check that what the widget shows actually reached the "server".
const publishServerState = {
  name: 'publish-mock-state',
  transformIndexHtml: () => [{
    tag: 'script',
    injectTo: 'body' as const,
    children: `(() => {
      const el = document.createElement('pre'); el.id = '__mock_state'; el.hidden = true; document.body.appendChild(el)
      const poll = () => fetch('/api/__mock/state').then(r => r.json()).then(rows => {
        el.textContent = JSON.stringify({ count: rows.length, accepted: rows.filter(r => r.reviewStatus === 'accepted').length })
      }).catch(() => {})
      poll(); setInterval(poll, 250)
    })()`,
  }],
}

export default mergeConfig(base, {
  plugins: [mockApi(), publishServerState],
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
  build: { outDir: new URL('./out/app', import.meta.url).pathname, emptyOutDir: true },
})
