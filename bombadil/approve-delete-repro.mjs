// Repro: in public mode, what does the user see when the API rejects
// Approve or Delete? Usage: node approve-delete-repro.mjs [origin]  (MOCK_FAIL_RATE=1 server)
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4392'
await fetch(`${ORIGIN}/api/__mock/reset`, { method: 'POST' })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const pins = () => page.locator('[data-fw-pin]').count()
const alertShown = () => page.locator('[data-fw-crrt] [role="alert"]').isVisible().catch(() => false)
const server = async () => (await (await fetch(`${ORIGIN}/api/__mock/state`)).json())

await page.goto(`${ORIGIN}/widget?public=1`)
await page.locator('[data-fw-pin]').first().waitFor()
const rows = []

// Approve the first open comment from its pin popover.
const before = await server()
const openIndex = before.findIndex((c) => c.reviewStatus === 'open')
await page.locator('[data-fw-pin]').nth(0).click()
await page.getByRole('button', { name: 'Approve' }).first().click()
await page.waitForTimeout(1200)
const afterApprove = await server()
rows.push({ action: 'Approve', apiFailed: true, alertShown: await alertShown(), uiUpdated: 'n/a',
  savedOnServer: afterApprove.filter((c) => c.reviewStatus === 'accepted').length > before.filter((c) => c.reviewStatus === 'accepted').length })

// Delete a comment from its pin popover.
await page.keyboard.press('Escape')
const pinsBefore = await pins()
await page.locator('[data-fw-pin]').first().click()
await page.getByRole('button', { name: 'More options' }).first().click()
await page.locator('[data-fw-crrt] button', { hasText: /^\s*Delete\s*$/ }).first().click()
await page.waitForTimeout(1200)
const pinsAfter = await pins()
const afterDelete = await server()
rows.push({ action: 'Delete', apiFailed: true, alertShown: await alertShown(), uiUpdated: pinsAfter < pinsBefore, savedOnServer: afterDelete.length < before.length })

await page.reload(); await page.locator('[data-fw-pin]').first().waitFor(); await page.waitForTimeout(800)
const pinsAfterReload = await pins()
console.table(rows)
console.log(`pins: before delete ${pinsBefore}, after delete ${pinsAfter}, after reload ${pinsAfterReload}`)
console.log(rows.every((r) => !r.alertShown && !r.savedOnServer) && pinsAfter < pinsBefore && pinsAfterReload === pinsBefore
  ? 'SILENT FAILURE: the screen says it worked, the server refused, and the user is not told.'
  : 'User was informed (or the flow did not run as expected).')
await browser.close()
// Either bug coming back fails the repro.
if (rows.some((r) => !r.alertShown && !r.savedOnServer)) process.exitCode = 1
