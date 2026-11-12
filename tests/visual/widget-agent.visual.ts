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
      if (state === 'handoff') {
        await page.getByRole('button', { name: 'Accept & send to agent', exact: true }).click()
        await expect(page.getByText('Handoff ready', { exact: true })).toBeVisible()
      }
    })
  })
}
