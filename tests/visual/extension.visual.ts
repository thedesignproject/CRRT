import { test, expect } from './fixtures/test'
import { extensionStates } from './inventory'
for (const state of extensionStates) {
  test(`extension / ${state}`, async ({ capture }) => {
    await capture('/extension', state, async page => {
      await expect(page.getByRole('heading', { name: state === 'disclosure' ? 'Before you drop a carrot' : ['signed-out', 'auth-error'].includes(state) ? 'Sign in to CRRT' : 'Drop a carrot', exact: true })).toBeVisible()
      if (state === 'auth-error') {
        await page.getByRole('button', { name: 'Sign in with CRRT' }).click()
        await expect(page.getByRole('alert')).toBeVisible()
      }
      if (state === 'local-expanded') await page.getByRole('button', { name: /Local feedback \(/ }).click()
      if (state === 'import-error') {
        await page.getByRole('button', { name: 'Import to Cloud', exact: true }).click()
        await page.getByRole('button', { name: 'Import local project' }).click()
        await expect(page.getByRole('status')).toBeVisible()
      }
    })
  })
}
