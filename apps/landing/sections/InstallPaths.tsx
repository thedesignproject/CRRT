import { ChromeLogo } from '../components/ChromeLogo'
import { useEffect, useRef, type CSSProperties } from 'react'
import { AppWindow, CirclePlay, ExternalLink } from 'lucide-react'
import { SectionIntro } from '../../../src/design-system'
import { DASHBOARD_HREF } from './Hero'
import { useScrollSteps } from '../lib/useScrollSteps'
import './capture-reel.css'


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
    title: 'Point. Comment. Keep the context.',
    description: 'Leave feedback on the exact element, with a screenshot attached.',
    clip: { src: '/capture-widget.mp4', poster: '/capture-widget.jpg', label: 'The CRRT widget on the crrt.ai pricing page: a comment is pinned to the Studio trial button and sent.' },
    action: { label: 'Install the widget', href: '/docs/install' },
  },
  chrome: {
    Icon: ChromeLogo,
    source: 'Chrome extension',
    title: 'Review any page. No code to install.',
    description: 'Leave feedback on localhost, previews, or production.',
    clip: { src: '/capture-chrome.mp4', poster: '/capture-chrome.jpg', label: 'The CRRT extension pinned in the Chrome toolbar: a comment is dropped on CRRT pages running on localhost, a Vercel preview, and crrt.ai.' },
    action: { label: 'Add to Chrome', href: CHROME_HREF },
  },
  storybook: {
    Icon: StorybookLogo,
    source: 'Storybook 10',
    title: 'Catch issues before they reach the page.',
    description: 'Review components with their story and test results attached.',
    clip: { src: '/capture-storybook.mp4', poster: '/capture-storybook.jpg', label: 'The CRRT Storybook panel on an icon-only button story: the failed accessible-name check is sent to CRRT.' },
    action: { label: 'Connect Storybook', href: DASHBOARD_HREF },
  },
  record: {
    badge: 'Private preview',
    Icon: CirclePlay,
    source: 'CRRT Record',
    title: 'Show the whole flow.',
    description: 'Record your screen, explain the issue, and mark what matters.',
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
const FRAME_DWELL = 1800

/** Desktop pins the section and pans the reel sideways, one capture method per step. */
export function InstallPaths() {
  const trackRef = useRef<HTMLDivElement>(null)
  const active = useScrollSteps(trackRef, captureEntries.length, '--reel-p', FRAME_DWELL, 2)
  return (
    <section id="install" className="landing-section landing-install capture-reel">
      <div ref={trackRef} className="reel-track">
        <div className="reel-sticky">
          <SectionIntro title="Leave feedback wherever you work." description="Four ways to leave feedback, one project that receives it." />
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
