import { useEffect, useRef, type CSSProperties } from 'react'
import { AppWindow, CirclePlay, ExternalLink } from 'lucide-react'
import { SectionIntro } from '../../../src/design-system'
import { DASHBOARD_HREF } from './Hero'
import { useScrollSteps } from '../lib/useScrollSteps'
import './capture-reel.css'

function ChromeLogo({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#EA4335" d="M12 0a12 12 0 0 1 10.4 6H12a6 6 0 0 0-5.2 3L3.6 3.5A12 12 0 0 1 12 0Z" />
    <path fill="#FBBC05" d="M22.4 6a12 12 0 0 1-10.4 18l5.2-9A6 6 0 0 0 12 6Z" />
    <path fill="#34A853" d="M12 24A12 12 0 0 1 3.6 3.5L6.8 9a6 6 0 0 0 10.4 6Z" />
    <circle cx="12" cy="12" r="5.3" fill="#4285F4" stroke="white" strokeWidth="1.2" />
  </svg>
}

function StorybookLogo({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#FF4785" d="M4 2.3 20 .9v22.2L4 21.7Z" />
    <path fill="white" d="m16 1.3-.1 4 1.5-1.1 1.3 1V1.1Z" />
    <path d="M15.8 8.4c-.3-2-5.6-2.3-5.7.4-.1 2.9 6.6 2.6 6.3 6.7-.3 4.6-8.3 4.1-8.5.1" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
}

const CHROME_HREF = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '/support#extension'

/** Each clip is the real surface, recorded on crrt.ai itself. */
const captureModes = {
  widget: {
    Icon: AppWindow,
    source: 'Website / App widget',
    title: 'Comment inside the product.',
    description: 'Pin feedback to the exact interface your team is reviewing. CRRT keeps the screenshot, selected element, viewport, and project instructions together.',
    clip: { src: '/capture-widget.mp4', poster: '/capture-widget.jpg', label: 'The CRRT widget on the crrt.ai pricing page: a comment is pinned to the Studio trial button and sent.' },
    action: { label: 'Install the widget', href: '/docs/install' },
  },
  chrome: {
    Icon: ChromeLogo,
    source: 'Chrome extension',
    title: 'Review any page before installing code.',
    description: 'Pin the extension once and it goes wherever you browse: localhost, a preview link, or production. Every comment lands in the same CRRT project.',
    clip: { src: '/capture-chrome.mp4', poster: '/capture-chrome.jpg', label: 'The CRRT extension pinned in the Chrome toolbar: a comment is dropped on CRRT pages running on localhost, a Vercel preview, and crrt.ai.' },
    action: { label: 'Add to Chrome', href: CHROME_HREF },
  },
  storybook: {
    Icon: StorybookLogo,
    source: 'Storybook 10',
    title: 'Review the component inside its story.',
    description: 'Send manual feedback or a failed check to CRRT with the component, story, and DOM evidence already attached.',
    clip: { src: '/capture-storybook.mp4', poster: '/capture-storybook.jpg', label: 'The CRRT Storybook panel on an icon-only button story: the failed accessible-name check is sent to CRRT.' },
    action: { label: 'Connect Storybook', href: DASHBOARD_HREF },
  },
  record: {
    badge: 'Private preview',
    Icon: CirclePlay,
    source: 'CRRT Record',
    title: 'Show the flow, not only one frame.',
    description: 'Record the tab with your voice, box what matters as you talk, and hand your agent the transcript, marks, and DOM targets in one payload.',
    clip: { src: '/capture-record.mp4', poster: '/capture-record.jpg', label: 'CRRT Record on the crrt.ai pricing page: a box is drawn around the Studio trial button while recording, then the review copies the agent payload for Claude Code.' },
    action: { label: 'Private preview' },
  },
} as const

type CaptureItem = (typeof captureModes)[keyof typeof captureModes]

const captureEntries = Object.entries(captureModes) as [keyof typeof captureModes, CaptureItem][]

/** Plays only while most of it is on screen, so the reel never runs every clip at once. */
function CaptureClip({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current!
    if (typeof IntersectionObserver === 'undefined' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => undefined)
      else video.pause()
    }, { threshold: 0.6 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])
  return <video ref={ref} src={src} poster={poster} aria-label={label} muted loop playsInline preload="metadata" />
}

function ChapterAction({ item }: { item: CaptureItem }) {
  return 'href' in item.action
    ? <a className="landing-capture-chapter-action" href={item.action.href}>{item.action.label} <ExternalLink size={13} /></a>
    : <span className="landing-capture-chapter-action is-disabled">{item.action.label}</span>
}

/** A fast scroll still lands on every clip: the 900ms pan settles, then the frame rests before the next. */
const FRAME_DWELL = 1300

/** Desktop pins the section and pans the reel sideways, one capture method per step. */
export function InstallPaths() {
  const trackRef = useRef<HTMLDivElement>(null)
  const active = useScrollSteps(trackRef, captureEntries.length, '--reel-p', FRAME_DWELL, 1)
  return (
    <section id="install" className="landing-section landing-install capture-reel">
      <SectionIntro title="Wherever you work. Bring CRRT." description="Four ways to leave feedback, one project that receives it. Scroll through each one." />
      <div ref={trackRef} className="reel-track">
        <div className="reel-sticky">
          <ol className="reel-strip" style={{ '--reel-index': active } as CSSProperties}>
            {captureEntries.map(([value, item], index) => <li key={value} className={`reel-frame${index === active ? ' is-active' : ''}`} aria-current={index === active ? 'step' : undefined}>
              <div className="reel-frame-copy">
                <span className="reel-source"><item.Icon size={20} />{item.source}{'badge' in item ? <em>{item.badge}</em> : null}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ChapterAction item={item} />
              </div>
              <figure className="reel-frame-stage reel-media"><CaptureClip {...item.clip} /></figure>
            </li>)}
          </ol>
        </div>
      </div>
    </section>
  )
}
