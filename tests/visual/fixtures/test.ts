import { mkdir, writeFile } from 'node:fs/promises'
import { test as base, expect, takeSnapshot } from '@chromatic-com/playwright'
import type { Page, TestInfo } from '@playwright/test'
import { preservePresentation } from './preserve-presentation'
import { fixedTime } from './data'
import { installNetwork } from './network'
import { mobileScreens } from '../inventory'
type Capture = (path: string, state?: string, action?: (page: Page) => Promise<void>) => Promise<void>
export const checkpointName = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
const fixture = base.extend<{ capture: Capture; withOpener: boolean }>({
  withOpener: [false, { option: true }],
  page: async ({ context, withOpener }, use) => {
    if (!withOpener) { const page = await context.newPage(); await use(page); await page.close(); return }
    const parent = await context.newPage()
    await parent.route('**/visual-opener', route => route.fulfill({ contentType: 'text/html', body: '<title>Widget host</title>' }))
    await parent.goto('http://127.0.0.1:4380/visual-opener')
    const popup = parent.waitForEvent('popup')
    await parent.evaluate(() => { window.open('about:blank') })
    const page = await popup
    await use(page)
    await page.close(); await parent.close()
  },
  capture: async ({ page }, use, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date(fixedTime) })
    await page.addInitScript(() => {
      if (new URLSearchParams(location.search).get('state') !== 'name-entry') localStorage.setItem('fw-crrt-author-name', 'Visual Reviewer')
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true })
    })
    await use(async (path, state = '', action) => {
      const unexpected = await installNetwork(page, state)
      const url = new URL(path, 'http://127.0.0.1:4380')
      url.searchParams.set('theme', info.title.startsWith('dashboard /') ? 'light' : 'dark')
      if (state) { url.searchParams.set('visualState', state); if (!url.searchParams.has('state')) url.searchParams.set('state', state) }
      await page.goto(url.href)
      await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true')
      if (action) await action(page)
      await page.locator('video').evaluateAll(videos => videos.forEach(element => {
        const video = element as HTMLVideoElement
        video.pause(); video.removeAttribute('src')
        video.querySelectorAll('source').forEach(source => source.remove())
        video.load()
      }))
      await page.evaluate(() => document.fonts.ready)
      await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => !(image instanceof HTMLImageElement) || !image.getBoundingClientRect().width || image.loading === 'lazy' || image.complete && image.naturalWidth > 0))).toBe(true)
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          if (animation.effect?.getComputedTiming().iterations === Infinity) animation.pause()
          else { try { animation.finish() } catch {} }
        }
      })
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
      await page.clock.runFor(100)
      await page.evaluate(preservePresentation)
      // Freezing presentation can expose text or change its font. Resolve the
      // resulting layout and font loads before the checkpoint and DOM archive.
      await page.evaluate(async () => {
        document.body.getBoundingClientRect()
        await document.fonts.ready
      })
      await page.clock.runFor(34)
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) if (animation.effect?.getComputedTiming().iterations !== Infinity) {
          try { animation.finish() } catch {}
        }
      })
      if (info.title.startsWith('widget /') && (state.startsWith('sidebar') && state !== 'sidebar-empty' || state === 'tracker-picker')) {
        await expect(page.locator('.fw-sidebar-card')).toHaveCount(3)
        await expect.poll(() => page.locator('.fw-sidebar-card').evaluateAll(cards => cards.every(card => Number(getComputedStyle(card).opacity) >= 0.5)), 'Every feedback card remains visible after freezing animations').toBe(true)
      }
      const fullPage = !/^(widget|extension)/.test(info.title) && !info.title.startsWith('public / home')
      const dir = 'artifacts/chromatic-simple/checkpoints'
      await mkdir(dir, { recursive: true })
      const name = checkpointName(info.title)
      let png = await page.screenshot({ path: `${dir}/${name}.png`, fullPage, animations: 'disabled' })
      await expect.poll(async () => {
        const next = await page.screenshot({ path: `${dir}/${name}.png`, fullPage, animations: 'disabled' })
        const stable = next.equals(png)
        png = next
        return stable
      }, { message: 'Source checkpoint must settle before archiving', timeout: 10_000 }).toBe(true)
      expect(png.readUInt32BE(16) * png.readUInt32BE(20), 'Chromatic snapshot pixel limit').toBeLessThanOrEqual(25_000_000)
      await page.evaluate(() => {
        document.documentElement.dataset.crrtWindowTop = String(scrollY)
        document.documentElement.dataset.crrtWindowLeft = String(scrollX)
        for (const element of document.querySelectorAll('*')) if (element.scrollTop || element.scrollLeft) {
          element.setAttribute('data-crrt-scroll-top', String(element.scrollTop))
          element.setAttribute('data-crrt-scroll-left', String(element.scrollLeft))
        }
      })
      expect(errors, 'Uncaught browser errors').toEqual([])
      expect(unexpected, 'Unexpected network requests').toEqual([])
      await writeFile(`${dir}/${name}.json`, JSON.stringify({ fullPage, viewport: page.viewportSize() }))
      await takeSnapshot(page, info)
    })
  },
})
export { expect }
export function test(title: string, body: (args: { page: Page; capture: Capture }, info: TestInfo) => Promise<void>) {
  for (const mobile of mobileScreens.includes(title) ? [false, true] : [false]) {
    fixture.describe(() => {
      const popup = title.startsWith('extension /')
      fixture.use({ viewport: popup ? { width: 380, height: 760 } : mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        withOpener: title === 'dashboard / widget-auth-login',
        colorScheme: title.startsWith('dashboard /') ? 'light' : 'dark',
        cropToViewport: /^(widget|extension)/.test(title) || title === 'public / home' })
      fixture(`${title}${mobile ? ' mobile' : ''}`, body)
    })
  }
}
