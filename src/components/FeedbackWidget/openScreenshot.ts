export function openScreenshot(url: string) {
  if (!url.startsWith('data:')) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  // Chromium blocks top-level data: navigation from a page. Demo and local
  // extension feedback keep screenshots as data URLs so they can be reloaded.
  const image = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(url)
  if (!image) return
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(image[2]), character => character.charCodeAt(0))
  } catch {
    return
  }
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: image[1] }))
  window.open(objectUrl, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
