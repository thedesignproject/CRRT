import { browser } from 'wxt/browser'
import { calculateCaptureRegion, calculateCaptureScale, type ScreenshotFocusRect } from '../../../src/lib/screenshotCapture'

export async function captureNativeScreenshot(focus: ScreenshotFocusRect | null): Promise<string> {
  const width = innerWidth, height = innerHeight, x = scrollX, y = scrollY
  const response = await browser.runtime.sendMessage({ type: 'comment:capture' })
  if (!response?.ok) throw new Error(response?.error || 'Screenshot unavailable')
  function validateViewport() {
    if (innerWidth !== width || innerHeight !== height || scrollX !== x || scrollY !== y) throw new Error('Viewport changed during screenshot capture')
  }
  validateViewport()
  if (typeof response.data !== 'string' || !response.data.startsWith('data:image/png;base64,')) throw new Error('Invalid screenshot image')
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Screenshot decoding failed'))
    image.src = response.data
  })
  validateViewport()
  if (!image.naturalWidth || !image.naturalHeight || width <= 0 || height <= 0) throw new Error('Invalid screenshot dimensions')
  const region = calculateCaptureRegion(focus, width, height)
  const scaleX = image.naturalWidth / width, scaleY = image.naturalHeight / height
  const left = Math.max(0, Math.floor(region.left * scaleX)), top = Math.max(0, Math.floor(region.top * scaleY))
  const right = Math.min(image.naturalWidth, Math.ceil((region.left + region.width) * scaleX))
  const bottom = Math.min(image.naturalHeight, Math.ceil((region.top + region.height) * scaleY))
  const cropWidth = right - left, cropHeight = bottom - top
  const scale = calculateCaptureScale(cropWidth, cropHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cropWidth * scale))
  canvas.height = Math.max(1, Math.round(cropHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Screenshot canvas unavailable')
  context.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
  const result = canvas.toDataURL('image/png')
  if (!result.startsWith('data:image/png;base64,')) throw new Error('Screenshot encoding failed')
  return result
}
