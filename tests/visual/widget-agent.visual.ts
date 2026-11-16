import { test, expect } from './fixtures/test'
import { widgetAgentStates } from './inventory'
for (const state of widgetAgentStates) {
  test(`widget-agent / ${state}`, async ({ capture }) => {
    await capture('/widget-agent', state, async page => {
      if (state === 'upgrade_required' || state === 'error') {
        await expect(page.getByText(state === 'error' ? 'Agent could not load' : 'Agent is a premium feature', { exact: true })).toBeVisible()
        return
      }
      await expect(page.getByRole('group', { name: 'Feedback to send' })).toBeVisible()
      await expect(page.getByText('2 of 3 selected')).toBeVisible()
      const send = page.getByRole('button', { name: 'SEND: Make the heading easier to read on narrow screens.', exact: true })
      if (state === 'offline') await expect(send).toBeDisabled()
      else await expect(send).toBeEnabled()
      if (state === 'sent') {
        await send.click()
        await expect(page.getByText('Queued', { exact: true })).toBeVisible()
        await expect(send).toBeDisabled()
      }
      if (state === 'handoff') {
        await page.getByRole('button', { name: 'Create prompt handoff', exact: true }).click()
        await expect(page.getByText('Handoff ready', { exact: true })).toBeVisible()
      }
    })
  })
}
