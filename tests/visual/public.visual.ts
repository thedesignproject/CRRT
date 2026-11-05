import { test, expect } from './fixtures/test'
import { publicScreens, auditStates } from './inventory'
for (const screen of publicScreens) {
  test(`public / ${screen.id}`, async ({ capture }) => {
    await capture(screen.path, '', async page => {
      await expect(page.locator('h1').first()).toBeVisible()
      if (screen.id !== 'home') await page.evaluate(async () => {
        for (let top = 0; top < document.body.scrollHeight; top += innerHeight) {
          scrollTo({ top, behavior: 'instant' }); await new Promise(requestAnimationFrame)
        }
        scrollTo({ top: 0, behavior: 'instant' })
      })
    })
  })
}
for (const state of auditStates) {
  test(`public / audit-${state}`, async ({ capture }) => {
    await capture('/audit/11111111-1111-4111-8111-111111111111', state, async page => {
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.getByText('Connecting to durable execution', { exact: true })).toHaveCount(0)
      if (state.endsWith('-findings')) await expect(page.getByText('Primary action is difficult to read', { exact: true })).toBeVisible()
    })
  })
}
