// Leak probe: repeat each widget interaction N times, force GC, and compare
// live DOM nodes / event listeners against a warmed-up baseline.
// Usage: node leak-probe.mjs [url] [cycles]
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')

const URL_ = process.argv[2] ?? 'http://127.0.0.1:4380/widget?state=idle'
const N = Number(process.argv[3] ?? 50)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')

async function measure() {
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(100)
  }
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  return { nodes: m.Nodes, listeners: m.JSEventListeners, heapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1) }
}

const menu = () => page.getByRole('button', { name: 'Open CRRT menu' })
const item = (re) => page.getByRole('menuitem', { name: re })
const esc = () => page.keyboard.press('Escape')
async function settle() { await page.waitForTimeout(250) }
async function reset() { for (let i = 0; i < 4; i++) await esc(); await settle() }

const scenarios = {
  'open/close menu': async () => { await menu().click(); await settle(); await esc() },
  'enter/exit pin mode': async () => { await menu().click(); await item(/Drop comment/).click(); await settle(); await esc() },
  'compose + cancel': async () => {
    await menu().click(); await item(/Drop comment/).click(); await settle()
    await page.locator('#target-heading').click(); await settle()
    await page.keyboard.type('leak probe'); await esc(); await esc()
  },
  'open/close sidebar': async () => { await menu().click(); await item(/Open sidebar/).click(); await settle(); await esc() },
  'select/deselect pin': async () => { await page.locator('[data-fw-pin]').first().click(); await settle(); await esc() },
  'scroll page': async () => { await page.mouse.wheel(0, 400); await settle(); await page.mouse.wheel(0, -400) },
  'hover page (selector frame)': async () => {
    await menu().click(); await item(/Drop comment/).click()
    for (let i = 0; i < 10; i++) await page.mouse.move(100 + i * 40, 120 + (i % 3) * 30)
    await esc()
  },
}

const only = process.env.ONLY
const results = []
for (const [name, run] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue
  await page.goto(URL_); await page.waitForSelector('[data-fw-launcher-root]'); await settle()
  try {
    for (let i = 0; i < 5; i++) { await run(); await settle() } // warm-up
    await reset()
    const before = await measure()
    for (let i = 0; i < N; i++) { await run(); await settle() }
    await reset()
    const after = await measure()
    results.push({
      scenario: name, cycles: N,
      nodes: `${before.nodes} → ${after.nodes}`, nodesPerCycle: +((after.nodes - before.nodes) / N).toFixed(2),
      listeners: `${before.listeners} → ${after.listeners}`, listenersPerCycle: +((after.listeners - before.listeners) / N).toFixed(2),
      heapMB: `${before.heapMB} → ${after.heapMB}`,
    })
  } catch (e) {
    results.push({ scenario: name, error: String(e).split('\n')[0] })
  }
}
console.table(results)
await browser.close()
