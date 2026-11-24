// Repro: in public mode (no personalComments adapter), does an edited
// comment survive a reload? Runs against the mock-API harness.
// Usage: node edit-repro.mjs [origin]
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4390'
const NEW_TEXT = `Edited by repro ${Date.now()}`

await fetch(`${ORIGIN}/api/__mock/reset`, { method: 'POST' })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

async function openFirstPin() {
  await page.locator('[data-fw-pin]').first().waitFor()
  await page.locator('[data-fw-pin]').first().click()
}

await page.goto(`${ORIGIN}/widget?public=1`)
await openFirstPin()
const before = await page.locator('[data-fw-crrt]').innerText()
await page.getByRole('button', { name: 'More options' }).first().click()
await page.waitForTimeout(300)
const editItem = page.locator('[data-fw-crrt] button', { hasText: /^\s*Edit\s*$/ })
if (!(await editItem.count())) {
  const items = (await page.locator('[data-fw-crrt] button').allInnerTexts()).map((t) => t.trim()).filter((t) => /^(Approve|Reopen|Delete|View list|Send to)/.test(t))
  console.log('FIXED: public mode no longer offers Edit. Pin menu items:', items.join(', '))
  await browser.close()
  process.exit(0)
}
await editItem.first().click()
const box = page.locator('[data-fw-crrt] textarea').first()
await box.fill(NEW_TEXT)
await page.getByRole('button', { name: /^Save$/ }).first().click()
await page.waitForTimeout(500)
const shownAfterSave = (await page.locator('[data-fw-crrt]').innerText()).includes(NEW_TEXT)

await page.reload()
await openFirstPin()
await page.waitForTimeout(300)
const shownAfterReload = (await page.locator('[data-fw-crrt]').innerText()).includes(NEW_TEXT)
const server = await (await fetch(`${ORIGIN}/api/__mock/state`)).json()
const savedOnServer = server.some((c) => c.body === NEW_TEXT)

console.table([{ edit: NEW_TEXT, shownAfterSave, savedOnServer, shownAfterReload }])
console.log(shownAfterSave && !shownAfterReload
  ? 'BUG REPRODUCED: the edit looks saved, but is gone after reload.'
  : 'Edit persisted (or the flow did not run as expected).')
if (!before) console.log('(warning: widget text was empty before edit)')
await browser.close()
if (shownAfterSave && !shownAfterReload) process.exitCode = 1
