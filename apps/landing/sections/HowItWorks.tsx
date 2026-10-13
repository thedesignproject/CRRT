import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { MousePointer2, ScanSearch, WandSparkles } from 'lucide-react'
import { DemoFrame, SectionIntro } from '../../../src/design-system'

const steps = [
  { number: '01', title: 'Spot it', body: 'Open the product and point at the exact thing that feels wrong.', Icon: ScanSearch },
  { number: '02', title: 'Mark it', body: 'Leave the comment where it happened. CRRT keeps the visual and page context.', Icon: MousePointer2 },
  { number: '03', title: 'Ship it', body: 'Hand the approved feedback to your agent. Review the proposed change before merge.', Icon: WandSparkles },
] as const

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const section = sectionRef.current!
    const video = videoRef.current!

    const playFromStart = () => {
      video.currentTime = 0
      setActiveStep(0)
      try {
        const playback = video.play()
        playback?.catch(() => undefined)
      } catch {
        // The poster remains visible when autoplay is unavailable.
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      playFromStart()
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) playFromStart()
      else video.pause()
    }, { threshold: 0.35 })
    observer.observe(section)

    return () => {
      observer.disconnect()
      video.pause()
    }
  }, [])

  const syncActiveStep = (event: SyntheticEvent<HTMLVideoElement>) => {
    const currentTime = event.currentTarget.currentTime
    setActiveStep(currentTime < 1.1 ? 0 : currentTime < 5.15 ? 1 : 2)
  }

  return (
    <section ref={sectionRef} id="how-it-works" className="landing-section landing-story">
      <div className="landing-story-sticky">
        <SectionIntro title="Give your agent eyes on the product." description="Pin feedback to the exact element. CRRT carries the visual context into implementation, then brings the fix back for review." />
        <div className="landing-story-grid">
          <ol className="landing-story-steps">
            {steps.map(({ number, title, body, Icon }, index) => (
              <li key={title} className={index === activeStep ? 'is-active' : index < activeStep ? 'is-complete' : ''} aria-current={index === activeStep ? 'step' : undefined}>
                <span className="landing-loop-number">{number}</span>
                <Icon size={19} aria-hidden="true" />
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
          <DemoFrame title="CRRT in action" status={`${steps[activeStep].number} / 03 · ${steps[activeStep].title}`} className="landing-story-frame">
            <div className="landing-story-scenes">
              <video
                ref={videoRef}
                className="landing-story-video"
                src="/crrt-workflow.mp4"
                poster="/crrt-workflow-poster.jpg"
                aria-label="CRRT turning visual product feedback into an agent-ready fix"
                onTimeUpdate={syncActiveStep}
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
          </DemoFrame>
        </div>
      </div>
    </section>
  )
}
