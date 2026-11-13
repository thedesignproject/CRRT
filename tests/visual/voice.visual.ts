import { test, expect } from './fixtures/test'
import { voiceStates } from './inventory'

for (const state of voiceStates) {
  test(`voice / ${state}`, async ({ capture }) => {
    await capture('/voice', state, async page => {
      // Exercise the real recorder/composer lifecycle with deterministic browser
      // devices. CI never requests a physical microphone or remote speech service.
      await page.evaluate((blocked) => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
          getUserMedia: async () => {
            if (blocked) throw new DOMException('Permission denied', 'NotAllowedError')
            return { getTracks: () => [{ stop() {} }] }
          },
        } })
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
          createAnalyser() { return { fftSize: 256, frequencyBinCount: 128,
            getByteFrequencyData(values: Uint8Array) { values.forEach((_, i) => { values[i] = 35 + (i * 17) % 150 }) } } }
          createMediaStreamSource() { return { connect() {} } }
          async resume() {}
          async close() {}
        } })
        Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
          state = 'inactive'
          mimeType = 'audio/wav'
          ondataavailable?: (event: { data: Blob }) => void
          onstop?: () => void
          start() { this.state = 'recording' }
          stop() {
            this.state = 'inactive'
            // Valid silent WAV; playable and archivable without external assets.
            const bytes = new Uint8Array(1644)
            const view = new DataView(bytes.buffer)
            const text = (at: number, value: string) => [...value].forEach((char, i) => { bytes[at + i] = char.charCodeAt(0) })
            text(0, 'RIFF'); view.setUint32(4, 1636, true); text(8, 'WAVEfmt ')
            view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
            view.setUint32(24, 8000, true); view.setUint32(28, 16000, true)
            view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 1600, true)
            this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) })
            this.onstop?.()
          }
        } })
        Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
          onresult?: (event: { results: { 0: { transcript: string } }[] }) => void
          onend?: () => void
          start() { this.onresult?.({ results: [{ 0: { transcript: 'Make the heading shorter, please.' } }] }) }
          stop() { this.onend?.() }
          abort() {}
        } })
      }, state === 'mic-blocked')
      await page.getByRole('button', { name: 'Open CRRT menu', exact: true }).click()
      await page.getByText('Drop comment', { exact: true }).click()
      await page.locator('#voice-target').click()
      await expect(page.getByRole('textbox', { name: 'Comment' })).toBeVisible()
      await expect(page.getByAltText('Selected element screenshot')).toBeVisible()
      if (state === 'composer') return
      await page.getByRole('button', { name: 'Record voice note', exact: true }).click()
      if (state === 'mic-blocked') {
        await expect(page.getByRole('alert')).toContainText('Microphone access was blocked')
        return
      }
      await expect(page.getByText('Recording', { exact: true })).toBeVisible()
      await page.clock.runFor(12_000)
      if (state === 'recording') return
      await page.getByRole('button', { name: 'Attach voice note', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Play voice note', exact: true })).toBeVisible()
      if (state === 'attached') return
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.getByRole('textbox', { name: 'Comment' })).toHaveCount(0)
      await page.locator('[data-fw-pin]').first().click()
      await page.getByRole('button', { name: 'Show transcript', exact: true }).filter({ visible: true }).first().click()
      await expect(page.getByText('Make the heading shorter, please.')).toBeVisible()
    })
  })
}
