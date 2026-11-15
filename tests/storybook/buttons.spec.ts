import { test, expect } from '@playwright/test'
for (const variant of ['default', 'secondary', 'quiet', 'small', 'large', 'disabled', 'widget-actions', 'widget-disabled']) {
  test(variant, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/iframe.html?id=shared-button--${variant}&viewMode=story`)
    const label = variant.startsWith('widget-') ? 'Send' : 'Start review'
    const button = page.getByRole('button', { name: label, exact: true })
    await expect(button).toBeVisible()
    if (variant.includes('disabled')) await expect(button).toBeDisabled()
    else await expect(button).toBeEnabled()
    expect(errors).toEqual([])
  })
}
