export default async function capture() {
  const state = new URLSearchParams(location.search).get('state')
  if (state === 'screenshot-pending') return new Promise<never>(() => {})
  if (state === 'screenshot-failed') throw new Error('Synthetic screenshot failure')
  const canvas = document.createElement('canvas')
  canvas.width = 400; canvas.height = 240
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fffcf6'; context.fillRect(0, 0, 400, 240)
  context.fillStyle = '#1f3a2f'; context.font = '24px sans-serif'; context.fillText('CRRT fixture screenshot', 28, 80)
  return canvas
}
