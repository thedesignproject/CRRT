import { useEffect, useState } from 'react'
import { Bot, Check, Code2, ExternalLink, Image, LayoutDashboard, MousePointer2, Puzzle, ScanSearch } from 'lucide-react'
import { SectionIntro } from '../../../src/design-system'
import { DASHBOARD_HREF } from './Hero'

const CHROME_HREF = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '/support#extension'
type CaptureMode = 'chrome' | 'dashboard'

export function InstallPaths() {
  const [mode, setMode] = useState<CaptureMode>('chrome')

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const interval = window.setInterval(() => setMode((current) => current === 'chrome' ? 'dashboard' : 'chrome'), 5600)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <section id="install" className="landing-section landing-install">
      <SectionIntro
        title="See it. Mark it. Keep moving."
        description="Capture feedback on any page. CRRT keeps the screenshot, context, and next step together."
      />

      <div className="landing-capture-stage">
        <header className="landing-capture-toolbar">
          <div className="landing-browser-address" aria-hidden="true">
            <i /><i /><i />
            <span>northwind.app/pricing</span>
          </div>
          <div className="landing-capture-switch" aria-label="Choose where to capture feedback">
            <button type="button" aria-pressed={mode === 'chrome'} onClick={() => setMode('chrome')}>
              <Puzzle size={15} aria-hidden="true" /> Chrome
            </button>
            <button type="button" aria-pressed={mode === 'dashboard'} onClick={() => setMode('dashboard')}>
              <LayoutDashboard size={15} aria-hidden="true" /> Dashboard
            </button>
          </div>
        </header>

        <div key={mode} className={`landing-capture-canvas is-${mode}`}>
          <div className="landing-demo-page" aria-hidden="true">
            <nav><strong>Northwind</strong><span>Product&nbsp;&nbsp;&nbsp; Pricing&nbsp;&nbsp;&nbsp; Docs</span><b>Sign in</b></nav>
            <div className="landing-demo-page-copy">
              <small>NEW — PLANNING V2</small>
              <h3>Plan less.<br />Ship more.</h3>
              <p>Turn your roadmap into one calm list your team actually ships.</p>
              <button type="button">Get started</button>
            </div>
            <div className="landing-demo-tasks">
              <strong>This week</strong><span>6 of 9</span>
              <i /><i /><i /><i />
            </div>
          </div>

          <div className="landing-capture-selection" aria-hidden="true"><MousePointer2 size={17} /></div>
          <div className="landing-capture-comment">
            <i>TO</i>
            <div><strong>The primary action disappears on mobile.</strong><span>Pricing CTA · 390 × 844</span></div>
          </div>

          <div className="landing-context-strip">
            <span><Image size={14} aria-hidden="true" /> Screenshot</span>
            <span><ScanSearch size={14} aria-hidden="true" /> Page context</span>
            <span><MousePointer2 size={14} aria-hidden="true" /> Selector</span>
          </div>

          <div className="landing-agent-ready">
            <i><Bot size={18} aria-hidden="true" /></i>
            <div><span>Context attached</span><strong>Ready for your agent</strong></div>
            <Check size={18} aria-hidden="true" />
          </div>

          <span className="landing-capture-source">Captured with {mode === 'chrome' ? 'Chrome' : 'Dashboard'}</span>
        </div>
      </div>

      <div className="landing-capture-actions">
        <div>
          <a className="ds-button ds-button-primary" href={DASHBOARD_HREF}>Start 14-day trial</a>
          <a className="ds-button ds-button-secondary" href={CHROME_HREF}><Puzzle size={16} aria-hidden="true" /> Add to Chrome</a>
        </div>
        <p><Code2 size={16} aria-hidden="true" /> Want full infrastructure control? <a href="/docs/self-host">Read the self-host guide <ExternalLink size={13} aria-hidden="true" /></a></p>
      </div>
    </section>
  )
}
