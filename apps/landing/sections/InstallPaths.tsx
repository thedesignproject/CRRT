import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  Bot,
  Check,
  CheckCircle2,
  CirclePlay,
  Code2,
  ExternalLink,
  Image,
  MousePointer2,
  Play,
  Puzzle,
  ScanSearch,
  Send,
} from 'lucide-react'
import { SectionIntro } from '../../../src/design-system'
import { DASHBOARD_HREF } from './Hero'

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

const captureModes = {
  widget: {
    label: 'Widget',
    Icon: AppWindow,
    address: 'northwind.app/pricing',
    source: 'Website / App widget',
    title: 'Comment inside the product.',
    description: 'Pin feedback to the exact interface your team is reviewing. CRRT keeps the screenshot, selected element, viewport, and project instructions together.',
    comment: 'The primary action disappears on mobile.',
    action: { label: 'Install the widget', href: '/docs/install' },
  },
  chrome: {
    label: 'Chrome',
    Icon: ChromeLogo,
    address: 'any-product.com/checkout',
    source: 'Chrome extension',
    title: 'Review any page before installing code.',
    description: 'Open the extension, point at the live UI, and send the capture into the same CRRT project workflow.',
    comment: 'This form loses its hierarchy at tablet width.',
    action: { label: 'Add to Chrome', href: CHROME_HREF },
  },
  storybook: {
    label: 'Storybook',
    Icon: StorybookLogo,
    address: 'localhost:6006/?path=/story/button',
    source: 'Storybook 10',
    title: 'Review the component inside its story.',
    description: 'Send manual feedback or a failed check to CRRT with the component, story, and DOM evidence already attached.',
    comment: 'The destructive state needs clearer emphasis.',
    action: { label: 'Connect Storybook', href: DASHBOARD_HREF },
  },
  record: {
    label: 'Record',
    badge: 'Private preview',
    Icon: CirclePlay,
    address: 'crrt.ai/record/session-21',
    source: 'CRRT Record',
    title: 'Show the flow, not only one frame.',
    description: 'Capture a focused walkthrough and leave feedback at the exact moment an interaction becomes unclear.',
    comment: 'The confirmation is easy to miss after submit.',
    action: { label: 'Private preview' },
  },
} as const

type CaptureMode = keyof typeof captureModes
type CaptureItem = (typeof captureModes)[CaptureMode]

const captureEntries = Object.entries(captureModes) as [CaptureMode, CaptureItem][]

function ProductPage() {
  return (
    <div className="landing-demo-page">
      <nav><strong>Northwind</strong><span>Product&nbsp;&nbsp;&nbsp; Pricing&nbsp;&nbsp;&nbsp; Docs</span><b>Sign in</b></nav>
      <div className="landing-demo-page-copy">
        <small>NEW — PLANNING V2</small>
        <h3>Plan less.<br />Ship more.</h3>
        <p>Turn your roadmap into one calm list your team actually ships.</p>
        <span className="landing-demo-cta">Get started</span>
      </div>
      <div className="landing-demo-tasks">
        <strong>This week</strong><span>6 of 9</span>
        <i /><i /><i /><i />
      </div>
    </div>
  )
}

function CommentArtifact({ item, meta }: { item: CaptureItem; meta: string }) {
  return (
    <div className="landing-capture-comment">
      <i>TO</i>
      <div><strong>{item.comment}</strong><span>{meta}</span></div>
    </div>
  )
}

function EvidenceStrip({ context }: { context: string }) {
  return (
    <div className="landing-context-strip">
      <span><Image size={14} aria-hidden="true" /> Screenshot</span>
      <span><ScanSearch size={14} aria-hidden="true" /> {context}</span>
      <span><MousePointer2 size={14} aria-hidden="true" /> Exact target</span>
    </div>
  )
}

function AgentReady() {
  return (
    <div className="landing-agent-ready">
      <i><Bot size={18} aria-hidden="true" /></i>
      <div><span>Context attached</span><strong>Ready for your agent</strong></div>
      <Check size={18} aria-hidden="true" />
    </div>
  )
}

function WidgetScene({ item }: { item: CaptureItem }) {
  return (
    <>
      <ProductPage />
      <div className="landing-capture-selection"><MousePointer2 size={17} /></div>
      <CommentArtifact item={item} meta="Widget · 390 × 844" />
      <EvidenceStrip context="Page context" />
      <AgentReady />
    </>
  )
}

function ChromeScene({ item }: { item: CaptureItem }) {
  return (
    <>
      <ProductPage />
      <div className="landing-chrome-selection" />
      <aside className="landing-chrome-panel">
        <header><Puzzle size={16} /><strong>CRRT</strong><span>Connected</span></header>
        <small>Selected element</small>
        <code>form.checkout</code>
        <p>{item.comment}</p>
        <div><span>Screenshot</span><span>DOM</span><span>Viewport</span></div>
        <b><Send size={13} /> Send to CRRT</b>
      </aside>
      <div className="landing-capture-selection"><MousePointer2 size={17} /></div>
      <AgentReady />
    </>
  )
}

function StorybookScene({ item }: { item: CaptureItem }) {
  return (
    <div className="landing-storybook-scene">
      <aside>
        <strong>Storybook</strong>
        <span>COMPONENTS</span>
        <b>Button</b>
        <i>Default</i>
        <i className="is-active">Destructive</i>
        <i>Ghost</i>
        <b>Alert</b>
        <b>Dialog</b>
      </aside>
      <main>
        <div className="landing-storybook-canvas"><span>Delete project</span></div>
        <section>
          <header><span>Controls</span><span>Interactions</span><strong>CRRT 🥕</strong></header>
          <div><CheckCircle2 size={15} /><span>Accessible name</span><b>Pass</b></div>
          <div className="is-failed"><i>!</i><span>{item.comment}</span><b>Send to CRRT</b></div>
        </section>
      </main>
    </div>
  )
}

function RecordScene({ item }: { item: CaptureItem }) {
  return (
    <div className="landing-record-scene">
      <div className="landing-record-screen">
        <ProductPage />
        <span className="landing-record-play"><Play size={22} fill="currentColor" /></span>
        <CommentArtifact item={item} meta="00:18 · Checkout flow" />
      </div>
      <div className="landing-record-timeline">
        <span>00:00</span>
        <div><i /><i /><i className="is-comment" /><i /><i /><i /></div>
        <span>00:34</span>
      </div>
      <div className="landing-record-moment"><i>TO</i><div><strong>Feedback at 00:18</strong><span>Click, narration, and viewport attached</span></div></div>
    </div>
  )
}

function CaptureStage({ mode }: { mode: CaptureMode }) {
  const item = captureModes[mode]
  const index = captureEntries.findIndex(([value]) => value === mode)

  return (
    <div className={`landing-capture-stage is-${mode} is-compact`}>
      <header className="landing-capture-toolbar">
        <div className="landing-browser-address" aria-hidden="true">
          <i /><i /><i />
          <span>{item.address}</span>
        </div>
        <div className="landing-capture-stage-meta">
          <item.Icon size={15} aria-hidden="true" />
          <strong>{item.label}</strong>
          {'badge' in item ? <span>{item.badge}</span> : null}
          <b>{String(index + 1).padStart(2, '0')} / 04</b>
        </div>
      </header>

      <div key={mode} className="landing-capture-canvas" aria-hidden="true">
        {mode === 'widget' ? <WidgetScene item={item} /> : null}
        {mode === 'chrome' ? <ChromeScene item={item} /> : null}
        {mode === 'storybook' ? <StorybookScene item={item} /> : null}
        {mode === 'record' ? <RecordScene item={item} /> : null}
      </div>
    </div>
  )
}

function ChapterAction({ item }: { item: CaptureItem }) {
  return 'href' in item.action
    ? <a className="landing-capture-chapter-action" href={item.action.href}>{item.action.label} <ExternalLink size={13} /></a>
    : <span className="landing-capture-chapter-action is-disabled">{item.action.label}</span>
}

export function InstallPaths() {
  const [mode, setMode] = useState<CaptureMode>('widget')
  const markers = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) setMode(entry.target.getAttribute('data-mode') as CaptureMode)
      }
    }, { rootMargin: `-${window.innerHeight * .4}px 0px -${window.innerHeight * .4}px 0px`, threshold: 0 })
    markers.current.forEach(marker => { if (marker) observer.observe(marker) })
    return () => observer.disconnect()
  }, [])
  const active = captureModes[mode]
  return (
    <section id="install" className="landing-section landing-install capture-theatre">
      <SectionIntro title="Wherever you work. Bring CRRT." description="On your product, across the web, inside Storybook, or through a recorded flow. See how each way brings feedback into your project." />
      <div className="capture-theatre-track">
        {captureEntries.map(([value], index) => <div key={value} className="capture-scroll-marker" data-mode={value} ref={element => { markers.current[index] = element }} style={{ top: `${index * 25 + 12.5}%` }} />)}
        <div className="capture-theatre-sticky">
          <nav className="capture-mode-rail" aria-label="Capture methods">
            {captureEntries.map(([value, item], index) => <button key={value} type="button" aria-pressed={value === mode} onClick={() => { setMode(value); markers.current[index]?.scrollIntoView({ block: 'center', behavior: 'instant' }) }}><small>0{index + 1}</small><item.Icon size={26} /><strong>{item.label}</strong>{'badge' in item && <span>Preview</span>}<i /></button>)}
          </nav>
          <div className="capture-theatre-main">
            <div className="capture-theatre-demo"><CaptureStage mode={mode} /></div>
            <div className="capture-theatre-copy" key={mode}><span className="capture-source"><active.Icon size={18} />{active.source}</span><h3>{active.title}</h3><p>{active.description}</p><ChapterAction item={active} /><div className="capture-project-destination"><CheckCircle2 size={18} /><div><strong>Same CRRT project.</strong><span>Feedback + context, together.</span></div></div></div>
          </div>
          <div className="capture-theatre-caption"><span>Scroll to explore · or choose a capture method</span><b>{String(captureEntries.findIndex(([value]) => value === mode) + 1).padStart(2, '0')} / 04</b></div>
        </div>
      </div>
      <div className="capture-theatre-mobile">{captureEntries.map(([value, item]) => <article key={value}><span className="capture-source"><item.Icon size={18} />{item.label}</span><h3>{item.title}</h3><p>{item.description}</p><CaptureStage mode={value} /><ChapterAction item={item} /></article>)}</div>
      <div className="landing-capture-actions"><p><Code2 size={16} aria-hidden="true" /> Want full infrastructure control? <a href="/docs/self-host">Read the self-host guide <ExternalLink size={13} aria-hidden="true" /></a></p></div>
    </section>
  )
}
