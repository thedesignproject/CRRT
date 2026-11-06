import { test, expect } from './fixtures/test'
import { widgetStates } from './inventory'
for (const state of widgetStates) {
  test(`widget / ${state}`, async ({ capture }) => {
    await capture(`/widget${['name-entry', 'private-login'].includes(state) ? '?public=1' : ''}`, state, async page => {
      await expect(page.getByRole('button', { name: 'Open CRRT menu', exact: true })).toBeVisible()
      if (state === 'idle') return
      await page.getByRole('button', { name: 'Open CRRT menu', exact: true }).click()
      if (state === 'launcher') return
      if (state.startsWith('sidebar') || state === 'tracker-picker') {
        await page.getByText('Open sidebar', { exact: true }).click()
        await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
        await page.locator('.fw-sidebar-card').evaluateAll(cards => Promise.all(cards.flatMap(card => card.getAnimations().map(animation => animation.finished))))
        if (state === 'sidebar-empty') await expect(page.getByText(/No comments|No feedback/i).first()).toBeVisible()
        if (state === 'sidebar-edit' || state === 'tracker-picker') {
          await page.getByRole('button', { name: 'More', exact: true }).first().click()
          await page.getByRole('button', { name: state === 'sidebar-edit' ? /Edit/ : /Send to/ }).first().click()
          if (state === 'tracker-picker') await expect(page.getByRole('dialog')).toBeVisible()
        }
        return
      }
      await page.getByText('Drop comment', { exact: true }).click()
      if (state === 'selecting') return
      await page.locator('#target-heading').click()
      if (state === 'name-entry' || state === 'private-login') {
        await expect(page.getByRole('dialog', { name: 'Your feedback identity' })).toBeVisible()
        if (state === 'private-login') await expect(page.getByText('Log in to leave feedback', { exact: true })).toBeVisible()
        return
      }
      await expect(page.getByPlaceholder('Leave your comment…')).toBeVisible()
      if (state === 'screenshot-failed') { await expect(page.getByText('Screenshot unavailable', { exact: true })).toBeVisible(); return }
      await expect(page.getByRole('button', { name: 'Remove screenshot' })).toBeVisible()
      await page.getByPlaceholder('Leave your comment…').fill('Improve heading readability.')
      if (state === 'composer-filled') return
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      if (state === 'send-error') await expect(page.getByRole('alert')).toContainText('Could not send')
      if (state === 'submitted') await expect(page.getByPlaceholder('Leave your comment…')).toHaveCount(0)
      if (state === 'sending') await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
    })
  })
}
