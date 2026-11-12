// Same extension point as xCures; the official renderer still rebuilds the DOM.
import official from '../../../node_modules/@chromatic-com/playwright/dist/storybook-config/preview.mjs'
export default {
  async renderToCanvas(context) {
    const dispose = await official.renderToCanvas(context)
    await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.sheet ? undefined : new Promise((resolve, reject) => { link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', reject, { once: true }) })))
    document.body.getBoundingClientRect()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await document.fonts.ready
    for (const element of document.querySelectorAll('[data-crrt-scroll-top]')) {
      const top = Number(element.getAttribute('data-crrt-scroll-top')), left = Number(element.getAttribute('data-crrt-scroll-left'))
      element.scrollTo({ top, left, behavior: 'instant' })
      if (Math.abs(element.scrollTop - top) > 1 || Math.abs(element.scrollLeft - left) > 1) throw new Error('Archived element scroll could not be restored')
    }
    const top = Number(document.documentElement.getAttribute('data-crrt-window-top')), left = Number(document.documentElement.getAttribute('data-crrt-window-left'))
    window.scrollTo({ left, top, behavior: 'instant' })
    if (Math.abs(scrollY - top) > 1 || Math.abs(scrollX - left) > 1) throw new Error('Archived window scroll could not be restored')
    // The official renderer preserves focus styling as a class. Native controls
    // also need actual browser focus (for example number-input spin buttons).
    document.querySelector('input[type="number"][class~=":focus"]')?.focus({ preventScroll: true })
    for (const animation of document.getAnimations()) if (animation.effect?.getComputedTiming().iterations !== Infinity) { try { animation.finish() } catch {} }
    // Finishing an entrance animation can expose text whose font was not needed
    // during the first layout. Resolve that layout/font load before declaring ready.
    document.body.getBoundingClientRect()
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    document.documentElement.dataset.crrtArchiveReady = 'true'
    return dispose
  },
}
