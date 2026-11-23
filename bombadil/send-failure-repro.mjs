// Repro: in public mode, what does the user see when the API rejects Send?
// Usage: node send-failure-repro.mjs [origin]   (use a MOCK_FAIL_RATE=1 server)
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4392'
const TEXT = `Repro send ${Date.now()}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const consoleLines = []; page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`))
await page.goto(`${ORIGIN}/widget?public=1`)
await page.getByRole('button', { name: 'Open CRRT menu' }).click()
await page.getByRole('menuitem', { name: /Drop comment/ }).click()
await page.locator('#target-copy').click()
const guest = page.getByRole('button', { name: 'Continue as guest' })
if (await guest.isVisible().catch(() => false)) {
  await page.locator('#fw-crrt-name-input').fill('Repro')
  await guest.click()
  await page.waitForTimeout(300)
  if (!(await page.locator('textarea[placeholder="Leave your comment…"]').count())) await page.locator('#target-copy').click()
}
const box = page.locator('textarea[placeholder="Leave your comment…"]')
await box.fill(TEXT)
console.log('send buttons:', await page.locator('[data-fw-crrt] button').evaluateAll(els => els.filter(e => /Send/.test(e.innerText)).map(e => [e.innerText.replace(/\n/g,' '), e.disabled])))
const status = page.waitForResponse((r) => r.url().includes('/v1/public/comments') && r.request().method() === 'POST')
await page.locator('[data-fw-crrt] button', { hasText: /^Send/ }).first().click()
const res = await status
await page.waitForTimeout(1500)
const alertShown = await page.locator('[data-fw-crrt] [role="alert"]').isVisible().catch(() => false)
const savedHint = (await page.locator('body').innerText()).includes('Saved. Drop another')
const draftKept = (await box.count()) > 0 && (await box.inputValue()) === TEXT
console.table([{ apiStatus: res.status(), alertShown, savedHint, draftKept }])
console.log(!alertShown && !savedHint
  ? 'SILENT FAILURE: the send was rejected and the user is not told.'
  : 'User was informed.')
console.log(consoleLines.filter((l) => l.includes('FeedbackWidget')).join('\n'))
await browser.close()
// Against a server that rejects the send, anything but an error is the bug
// (including a "Saved" hint for a comment the server refused).
if (res.status() >= 400 && !alertShown) process.exitCode = 1
