import { test, expect } from './fixtures/test'
import { addonStates } from './inventory'
for (const state of addonStates) {
  test(`addon / ${state}`, async ({ capture }) => {
    await capture('/addon', state, async page => {
      await expect(page.getByText(state === 'no-story' ? 'Select a story to talk to CRRT about it.' : '🥕 Components/Button', { exact: true })).toBeVisible()
      if (!['no-story', 'legacy', 'connecting'].includes(state)) await expect(page.getByText(/Checking your CRRT access/)).toHaveCount(0)
    })
  })
}
