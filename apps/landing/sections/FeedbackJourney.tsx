import { useEffect, useRef, type RefObject } from 'react'
import { ArrowRight, Bot, Check, GitPullRequest, MessageCircle, MousePointer2, X } from 'lucide-react'
import { GitHubMark, LinearMark, JiraMark } from './Integrations'
import { CarrotIcon } from '../components/CarrotIcon'
import { useScrollSteps } from '../lib/useScrollSteps'
import './feedback-journey.css'

const acts = [
  { title: 'Point at what’s wrong.', description: 'Click the element and say what you want. CRRT keeps the screenshot, the selector, and the viewport with your words.' },
  { title: 'Your team agrees on what ships.', description: 'Feedback from the product, Chrome, and Storybook lands in one project. Approve the comments that are ready for work.' },
  { title: 'Your agent gets the full picture.', description: 'Approved feedback goes to Claude Code, Codex, or Cursor with the evidence attached. Prefer a tracker? Open the issue in Linear, GitHub, or Jira.' },
  { title: 'The fix comes back to the comment.', description: 'Your agent drafts the change on a branch. Compare it with the original screenshot, then merge it yourself.' },
] as const

/** Each act holds four beats, so the story advances on scroll without feeling like tabs. */
export const BEATS_PER_ACT = 4
const BEATS = acts.length * BEATS_PER_ACT
/** A fast scroll still plays every beat, at this many ms each. */
const BEAT_DWELL = 280
/** Extra beats of scroll the fixed card stays pinned for before the page moves on. */
export const BEATS_HELD = 3

const terminalLines = [
  { at: 1, text: <><b>claude</b> Reading CRRT feedback #24 from Northwind</> },
  { at: 1, text: <><i>attached</i> screenshot.png · button.primary-action · 1440 × 900</> },
  { at: 2, text: <><b>claude</b> The primary action uses the ghost style, so it reads as secondary. Switching it to the filled button.</> },
  { at: 2, text: <><i>edit</i> src/components/pricing-card.tsx <em>+6 −2</em></> },
  { at: 2, text: <><i>edit</i> src/styles/button.css <em>+3 −1</em></> },
  { at: 3, text: <><b>claude</b> Draft ready for review. PR #212 links back to feedback #24.</> },
] as const

const SCENE_WIDTH = 860
const SCENE_HEIGHT = 660

/** Scales the fixed-size scene to whatever room the sticky viewport leaves it. */
export function useSceneFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current!
    const fit = () => {
      const { width, height } = element.getBoundingClientRect()
      element.style.setProperty('--story-fit', Math.min(width / SCENE_WIDTH, height / SCENE_HEIGHT).toFixed(4))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
}

function CapturePreview({ fixed = false }: { fixed?: boolean }) {
  return <figure className={`crrt-capture-preview${fixed ? ' is-fixed' : ''}`} aria-label={fixed ? 'Pricing page after the fix with a prominent primary button' : 'Screenshot of the pricing page with the selected button highlighted'}>
    <div className="crrt-capture-browser"><i /><i /><i /><span>northwind.app/pricing</span></div>
    <div className="crrt-capture-page"><span>Northwind</span><strong>Good plans.<br />Better days.</strong><p>One place for the work that matters.</p><div className="crrt-capture-selection">Start your project <ArrowRight size={12} />{fixed ? <b className="crrt-fixed-pin"><Check size={12} /></b> : <b className="carrot-pin"><CarrotIcon size={28} /></b>}</div></div>
    <figcaption><MousePointer2 size={12} /> button.primary-action <span>1440 × 900</span></figcaption>
  </figure>
}

function FeedbackCard() {
  return <div className="journey-feedback-card">
    <div className="journey-person"><b>TO</b><div><strong>Tomás</strong><span>Pricing page · Desktop</span></div><small>#24</small></div>
    <p className="journey-comment">The primary action gets lost on this card. Make it the first thing people see.</p>
    <CapturePreview />
  </div>
}

/** Mirrors the product's feedback panel; only its content changes between steps. */
function JourneyPanel({ step, approved }: { step: number; approved: boolean }) {
  return <aside className="journey-panel" aria-label="Illustrative CRRT feedback workflow">
    <header className="journey-feedback-header"><div key={step}><strong>{['Feedback', 'Project inbox', 'Send feedback', 'Fix ready'][step]}</strong><span>Northwind · {['1 comment · 0 ready', approved ? 'Shared project · 1 ready' : 'Shared project', 'Shared project', 'Ready for review'][step]}</span></div><span className="journey-close" aria-hidden="true"><X size={18} /></span></header>
    <div className="journey-panel-body" key={step}>
      {step === 0 && <><div className="journey-agent-entry"><span className="journey-bot"><Bot size={20} /></span><div><strong>Open agent</strong><span>Approve comments to queue work</span></div><kbd>Shift + A</kbd></div><div className="journey-filters"><span className="is-selected">All 1</span><span>Open 1</span><span>Ready 0</span></div><FeedbackCard /></>}
      {step === 1 && <><div className="crrt-team"><span>TO</span><span>DI</span><span>PR</span><strong>Review together</strong></div><div className={`crrt-inbox-row is-selected${approved ? ' is-approved' : ''}`}><b>TO</b><div><strong>The primary action gets lost on this card.</strong><span>Tomás · Website / App · #24</span></div><i>{approved ? <><Check size={11} /> Ready</> : 'Open'}</i></div><div className="crrt-inbox-row"><b>DI</b><div><strong>Can we make this label clearer?</strong><span>Dianne · Chrome · #25</span></div><i>Open</i></div><div className="crrt-inbox-row"><b>PR</b><div><strong>Button needs an accessible name.</strong><span>Pranav · Storybook · #26</span></div><i>Open</i></div><div className="crrt-team-review"><MessageCircle size={16} /><div><strong>Agree on the next step</strong><p>Review the screenshot and context before marking feedback ready.</p></div></div><div className="crrt-selected-context"><span>Selected feedback · #24</span><CapturePreview /></div></>}
      {step === 2 && <><div className="crrt-handoff-summary"><span>Selected feedback · #24</span><strong>The primary action gets lost on this card.</strong><div><Check size={12} /> Screenshot <Check size={12} /> Context</div></div><p className="crrt-destination-label">Hand it to your coding agent</p><div className="crrt-agent-destination"><Bot size={24} /><div><strong>Send to Claude Code</strong><span>Also works with Codex and Cursor</span></div></div><p className="crrt-destination-label">Or create a tracked issue</p><div className="crrt-destinations">{[{ name: 'Linear', Mark: LinearMark }, { name: 'GitHub', Mark: GitHubMark }, { name: 'Jira', Mark: JiraMark }].map(({ name, Mark }) => <div key={name}><Mark /><strong>{name}</strong><ArrowRight size={15} /></div>)}</div></>}
      {step === 3 && <><div className="crrt-handoff-summary"><span>Feedback · #24</span><strong>The primary action gets lost on this card.</strong><div><Check size={12} /> Approved <Check size={12} /> Change drafted</div></div><div className="journey-code"><span>Claude Code · Draft</span><p><GitPullRequest size={12} /> PR #212 · Make the primary action stand out</p><p>2 files changed</p></div><div className="crrt-before-after"><div><span>Before</span><CapturePreview /></div><div><span>After</span><CapturePreview fixed /></div></div><div className="journey-review"><Check size={16} /><div><strong>Merge when it looks right</strong><span>The change stays a draft until you approve it.</span></div></div></>}
    </div>
  </aside>
}

/** A generic product component, drawn the way a design review sees it. Only the action changes. */
function PricingCard({ fixed }: { fixed: boolean }) {
  return <div className={`story-ui${fixed ? ' is-fixed' : ''}`}>
    <header><i /><span><b /><b /></span></header>
    <strong>Team</strong>
    <p>$12 <small>per seat / month</small></p>
    <ul><li /><li /><li /></ul>
    <div className="story-cta">{fixed ? 'Start free trial' : 'Start trial'}</div>
  </div>
}

/** One persistent scene. Acts and beats are data attributes; CSS owns every move. */
function StoryScene({ act, sub }: { act: number; sub: number }) {
  const panelStep = act === 0 ? 0 : act === 1 ? (sub < 3 ? 1 : 2) : act === 2 ? 2 : 3
  return <div className="story-scene" data-act={act} data-sub={sub} aria-hidden="true">
    <div className="story-card">
      <span className="story-card-brand">Northwind</span>
      <PricingCard fixed={false} />
      <div className="story-card-after"><span className="story-card-brand">Northwind</span><PricingCard fixed /></div>
      <i className="story-scanline" />
      <i className="story-flash" />
      <span className="story-frame" />
      <span className="story-fixed-pin"><Check size={14} /></span>
      <span className="story-toast"><Check size={13} /> #24 fixed · ready for review</span>
    </div>
    <MousePointer2 className="story-cursor" size={22} />
    <div className="story-composer">
      <b>TO</b>
      <div><strong>Tomás</strong><small>Just now</small></div>
      <p><span>The primary action gets lost on this card. Make it the first thing people see.</span></p>
      <footer><span>Screenshot</span><span>button.primary-action</span><span>1440 × 900</span></footer>
    </div>
    <div className="story-panel"><JourneyPanel step={panelStep} approved={act > 1 || (act === 1 && sub >= 2)} /></div>
    <div className="story-terminal">
      <header><i /><i /><i /><span>~/northwind</span></header>
      <p className="story-prompt">&gt; claude &quot;Fix CRRT feedback #24&quot;</p>
      {terminalLines.map((line, index) => <p key={index} className={act === 2 && sub >= line.at ? 'is-shown' : ''}>{line.text}</p>)}
      <span className="story-terminal-cursor" />
    </div>
    <span className="story-carrot"><CarrotIcon size={34} /></span>
  </div>
}

export function FeedbackJourney() {
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const beat = useScrollSteps(trackRef, BEATS, '--story-p', BEAT_DWELL, BEATS_HELD)
  useSceneFit(viewportRef)
  const act = Math.floor(beat / BEATS_PER_ACT)
  const sub = beat % BEATS_PER_ACT

  return (
    <section className="landing-section feedback-journey" id="how-it-works">
      <div ref={trackRef} className="story-track" data-act={act}>
        <div className="story-sticky" id="try-crrt" tabIndex={-1} aria-labelledby="story-title">
          <h2 id="story-title" className="story-title">Give your agent eyes on the product.</h2>
          <div className="story-copy">
            {acts.map((item, index) => <article key={item.title} className={index === act ? 'is-active' : ''} aria-hidden={index !== act}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>)}
          </div>
          <div ref={viewportRef} className="story-viewport"><div className="story-box"><StoryScene act={act} sub={sub} /></div></div>
        </div>
      </div>
    </section>
  )
}
