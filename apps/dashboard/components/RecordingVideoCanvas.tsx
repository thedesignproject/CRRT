import { useEffect, useRef, type RefObject } from 'react'

/** Use the same sRGB paint path with and without overlapping camera/annotation layers. */
export function RecordingVideoCanvas({ source, crop = true, label = 'Camera preview', className }: { source: RefObject<HTMLVideoElement | null>; crop?: boolean; label?: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const video = source.current!
    const surface = canvas.current!
    const context = surface.getContext('2d')
    if (!context) return
    let frame = 0
    const videoFrames = typeof video.requestVideoFrameCallback === 'function'
    function schedule() { frame = videoFrames ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick) }
    function cancel() { if (videoFrames) video.cancelVideoFrameCallback(frame); else cancelAnimationFrame(frame) }
    function draw() {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
      if (crop) {
        const side = Math.min(video.videoWidth, video.videoHeight)
        context!.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, surface.width, surface.height)
      } else {
        if (surface.width !== video.videoWidth) surface.width = video.videoWidth
        if (surface.height !== video.videoHeight) surface.height = video.videoHeight
        context!.drawImage(video, 0, 0)
      }
    }
    function tick() {
      draw()
      if (!video.paused && !video.ended) schedule()
    }
    function start() { cancel(); schedule() }
    video.addEventListener('loadeddata', draw)
    video.addEventListener('seeked', draw)
    video.addEventListener('play', start)
    draw()
    return () => {
      cancel()
      video.removeEventListener('loadeddata', draw)
      video.removeEventListener('seeked', draw)
      video.removeEventListener('play', start)
    }
  }, [source, crop])
  return <canvas ref={canvas} width={crop ? 256 : 1600} height={crop ? 256 : 900} className={className} role="img" aria-label={label} />
}
