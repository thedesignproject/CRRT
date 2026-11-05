import screenshot from '../fixtures/capture.png'

export default async function capture() {
  const state = new URLSearchParams(location.search).get('state')
  if (state === 'screenshot-pending') return new Promise<never>(() => {})
  if (state === 'screenshot-failed') throw new Error('Synthetic screenshot failure')
  const canvas = document.createElement('canvas')
  canvas.width = 400; canvas.height = 240
  // Keep the synthetic preview identical on macOS and Linux; system-font canvas
  // text otherwise changes pixels even when the widget itself is unchanged.
  const image = new Image()
  image.src = screenshot
  await image.decode()
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  return canvas
}
