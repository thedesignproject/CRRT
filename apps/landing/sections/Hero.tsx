import { useRef, useState } from 'react'
import { Check, MessageCircle, Send } from 'lucide-react'
import { NavLink, ThemeToggle } from '../../../src/design-system'
import { CarrotIcon } from '../components/CarrotIcon'
import { Wordmark } from '../components/Wordmark'

export const DASHBOARD_HREF = import.meta.env.DEV && !import.meta.env.SSR ? 'http://localhost:5173' : '/dashboard'

const FEEDBACK = [
  {
    initials: 'MK',
    message: 'This headline doesn’t explain the product yet.',
    meta: 'Hero heading · Desktop',
    placement: 'is-left',
  },
  {
    initials: 'AL',
    message: 'Can we make the primary action easier to find?',
    meta: 'Trial button · 1440 × 900',
    placement: 'is-right-top',
  },
  {
    initials: 'TO',
    message: 'The mobile crop should keep the face in focus.',
    meta: 'Hero image · Mobile',
    placement: 'is-right-bottom',
  },
] as const

export function Hero({ authenticated }: { authenticated: boolean }) {
  const [mediaReady, setMediaReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const revealVideo = () => {
    setMediaReady(true)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    try {
      videoRef.current?.play()?.catch(() => undefined)
    } catch {
      // The poster remains visible when autoplay is unavailable.
    }
  }

  return (
    <section id="product" className="landing-hero">
      <div className={`landing-photo-stage ${mediaReady ? 'is-media-ready' : ''}`}>
        <Navigation authenticated={authenticated} />
        <div className="landing-photo-media">
          <video
            ref={videoRef}
            src="/crrt-hero.mp4"
            poster="/crrt-hero-portrait.jpg"
            aria-label="Close portrait of a person looking at a screen"
            onCanPlay={revealVideo}
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
        <div className="landing-photo-shade" aria-hidden="true" />

        <div className="landing-photo-copy">
          <h1><span>Humans give feedback.</span>{' '}<span>Agents ship the fix.</span></h1>
          <p>Comment on your live UI. Give your coding agent the context to fix it.</p>
          <a className="landing-hero-cta" href={DASHBOARD_HREF}>
            <span><CarrotIcon size={28} /></span>
            {authenticated ? 'Open Dashboard' : 'Start Free Trial'}
          </a>
        </div>

        <div className="landing-floating-feedback" aria-label="Example product feedback">
          {FEEDBACK.map((feedback) => (
            <article className={`landing-glass-comment ${feedback.placement}`} key={feedback.message}>
              <span className="landing-comment-avatar">{feedback.initials}</span>
              <div>
                <p>{feedback.message}</p>
                <span><Check size={12} aria-hidden="true" /> {feedback.meta}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className="landing-glass-widget" aria-label="CRRT feedback widget preview">
          <header>
            <span><MessageCircle size={15} aria-hidden="true" /> CRRT feedback</span>
            <i>Live</i>
          </header>
          <div className="landing-widget-target"><span /> Selected: hero headline</div>
          <p>Make the promise more specific to what CRRT helps me ship.</p>
          <footer>
            <span>Screenshot attached</span>
            <button type="button" aria-label="Send example feedback"><Send size={14} aria-hidden="true" /></button>
          </footer>
        </aside>
      </div>
    </section>
  )
}

export function Navigation({ authenticated }: { authenticated: boolean }) {
  return (
    <nav className="landing-navigation" aria-label="Main navigation">
      <a href="#product" aria-label="CRRT home" className="landing-navigation-brand"><Wordmark level="nav" /></a>
      <div className="landing-navigation-links">
        <NavLink href="#product">Product</NavLink>
        <NavLink href="#how-it-works">How it works</NavLink>
        <NavLink href="#install">Capture anywhere</NavLink>
        <NavLink href="#pricing">Pricing</NavLink>
        <NavLink href="/docs">Docs</NavLink>
      </div>
      <div className="landing-navigation-actions">
        <ThemeToggle />
        <a className="ds-button ds-button-primary ds-button-sm" href={DASHBOARD_HREF}>
          {authenticated ? 'Dashboard' : 'Start trial'}
        </a>
      </div>
    </nav>
  )
}
