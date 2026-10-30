import { useEffect, useRef } from 'react'
import { DemoFrame, SectionIntro } from '../../../src/design-system'

export function ProductProof() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const video = videoRef.current
    if (!section || !video || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const playVideo = () => {
      try {
        video.play()?.catch(() => undefined)
      } catch {
        // The poster remains visible when autoplay is unavailable.
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      playVideo()
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) playVideo()
      else video.pause()
    }, { threshold: 0.3 })
    observer.observe(section)

    return () => {
      observer.disconnect()
      video.pause()
    }
  }, [])

  return (
    <section ref={sectionRef} className="landing-section landing-proof">
      <SectionIntro title="More than a screenshot in a prompt." description="CRRT gives every comment the project’s design rules, screenshot, selector, viewport, and approved direction. Your agent gets the full brief; your team keeps the review step." />
      <DemoFrame title="CRRT Workspace" status="3 fixes ready" className="landing-dashboard-frame">
        <div className="landing-dashboard-video-shell">
          <video
            ref={videoRef}
            className="landing-dashboard-video"
            src="/crrt-dashboard.mp4"
            poster="/crrt-dashboard-poster.jpg"
            aria-label="CRRT dashboard showing feedback moving from review to implementation"
            muted
            loop
            playsInline
            preload="metadata"
          />
        </div>
      </DemoFrame>
    </section>
  )
}
