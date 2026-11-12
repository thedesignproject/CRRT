import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const output = 'artifacts/chromatic-simple'
const index = JSON.parse(readFileSync(`${output}/storybook/index.json`, 'utf8')) as { entries: Record<string, { title: string }> }
for (const [id, story] of Object.entries(index.entries)) {
  const title = story.title.slice(story.title.indexOf('/') + 1)
  const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
  const metadata = JSON.parse(readFileSync(`${output}/checkpoints/${name}.json`, 'utf8'))
  test(story.title, async ({ page }) => {
    await page.setViewportSize(metadata.viewport)
    await page.goto(`/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`)
    await expect(page.locator('html')).toHaveAttribute('data-crrt-archive-ready', 'true')
    await expect(page.locator('body')).not.toBeEmpty()
    await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => !(image instanceof HTMLImageElement) || !image.getBoundingClientRect().width || image.loading === 'lazy' || image.complete && image.naturalWidth > 0))).toBe(true)
    // Playwright waits for stable consecutive frames; a single buffer can catch
    // the old fallback glyphs immediately after a web font finishes loading.
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: metadata.fullPage, animations: 'disabled', maxDiffPixels: 1000, maxDiffPixelRatio: 0.001, threshold: 0.2 })
  })
}
