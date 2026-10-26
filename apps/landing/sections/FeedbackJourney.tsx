import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bot, Check, MessageCircle, MousePointer2, Users, Send, X } from 'lucide-react'
import { GitHubMark, LinearMark, JiraMark } from './Integrations'
import { CarrotIcon } from '../components/CarrotIcon'
import './feedback-journey.css'

const chapters = [
  { label: 'Comment in context', title: 'Point to the problem. Leave the guesswork out.', description: 'Leave a comment on the live UI. The screenshot, selected element, page, and viewport travel with it.', detail: 'Your feedback, exactly where it happened.', Icon: MessageCircle },
  { label: 'Bring the team together', title: 'One project. Everyone’s feedback.', description: 'Bring feedback from your product, Chrome, and Storybook into the same project. Your team reviews and prioritizes it together.', detail: 'A shared inbox. A clear next step.', Icon: Users },
  { label: 'Choose the next step', title: 'Your tracker. Or your coding agent.', description: 'Send the feedback to Linear, GitHub, or Jira. Or hand it to your coding agent with the context attached.', detail: 'Your team decides what happens next.', Icon: Send },
] as const

function CapturePreview() {
  return <figure className="crrt-capture-preview" aria-label="Screenshot of the pricing page with the selected button highlighted">
    <div className="crrt-capture-browser"><i /><i /><i /><span>northwind.app/pricing</span></div>
    <div className="crrt-capture-page"><span>Northwind</span><strong>Good plans.<br />Better days.</strong><p>One place for the work that matters.</p><div className="crrt-capture-selection">Start your project <ArrowRight size={12} /><b className="carrot-pin"><CarrotIcon size={28} /></b></div></div>
    <figcaption><MousePointer2 size={12} /> button.primary-action <span>390 × 844</span></figcaption>
  </figure>
}

function FeedbackCard() {
  return <div className="journey-feedback-card">
    <div className="journey-person"><b>TO</b><div><strong>Tomás</strong><span>Pricing page · Mobile</span></div><small>#24</small></div>
    <p className="journey-comment">The primary action gets lost on mobile. Make it easier to find.</p>
    <CapturePreview />
  </div>
}

function JourneyPanel({ step }: { step: number }) {
  return <aside className="journey-panel" aria-label="Illustrative CRRT feedback workflow">
    <header className="journey-feedback-header"><div><strong>{['Feedback', 'Project inbox', 'Send feedback'][step]}</strong><span>Northwind · {step === 0 ? '1 comment · 0 ready' : 'Shared project'}</span></div><span className="journey-close" aria-hidden="true"><X size={18} /></span></header>
    <div className="journey-panel-body">
      {step === 0 && <><div className="journey-agent-entry"><span className="journey-bot"><Bot size={20} /></span><div><strong>Open agent</strong><span>Approve comments to queue work</span></div><kbd>Shift + A</kbd></div><div className="journey-filters"><span className="is-selected">All 1</span><span>Open 1</span><span>Ready 0</span></div><FeedbackCard /></>}
      {step === 1 && <><div className="crrt-team"><span>TO</span><span>DI</span><span>PR</span><strong>Review together</strong></div><div className="crrt-inbox-row is-selected"><b>TO</b><div><strong>The primary action gets lost on mobile.</strong><span>Tomás · Website / App · #24</span></div><i>Open</i></div><div className="crrt-inbox-row"><b>DI</b><div><strong>Can we make this label clearer?</strong><span>Dianne · Chrome · #25</span></div><i>Open</i></div><div className="crrt-inbox-row"><b>PR</b><div><strong>Button needs an accessible name.</strong><span>Pranav · Storybook · #26</span></div><i>Open</i></div><div className="crrt-team-review"><MessageCircle size={16} /><div><strong>Agree on the next step</strong><p>Review the screenshot and context before marking feedback ready.</p></div></div><div className="crrt-selected-context"><span>Selected feedback · #24</span><CapturePreview /></div></>}
      {step === 2 && <><div className="crrt-handoff-summary"><span>Selected feedback · #24</span><strong>The primary action gets lost on mobile.</strong><div><Check size={12} /> Screenshot <Check size={12} /> Context</div></div><p className="crrt-destination-label">Create a tracked issue</p><div className="crrt-destinations">{[{name:'Linear',Mark:LinearMark},{name:'GitHub',Mark:GitHubMark},{name:'Jira',Mark:JiraMark}].map(({name,Mark})=><div key={name}><Mark /><strong>{name}</strong><ArrowRight size={15} /></div>)}</div><p className="crrt-destination-label">Or hand it to your coding agent</p><div className="crrt-agent-destination"><Bot size={24} /><div><strong>Send to Claude Code</strong><span>Also works with Codex and Cursor</span></div></div></>}
    </div>
  </aside>
}

function JourneyStage({ step }: { step: number }) {
  return <div className={`journey-stage journey-step-${step}`}>
    <div className="journey-product" aria-hidden="true"><header><strong>Northwind</strong><span>Product &nbsp; Pricing</span></header><div className="journey-product-content"><span>Made for a calmer week.</span><h3>Good plans.<br />Better days.</h3><p>One place for the work that matters.</p><div className="journey-product-button">Start your project <ArrowRight size={15} /><b className="crrt-page-pin carrot-pin"><CarrotIcon size={32} /></b></div></div><div className="crrt-project-note"><MessageCircle size={16} /><strong>#24</strong><span>The primary action gets lost on mobile.</span></div></div>
    <JourneyPanel step={step} />
  </div>
}

export function FeedbackJourney() {
  const [step, setStep] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.isIntersecting)
      if (entry) setStep(Number((entry.target as HTMLElement).dataset.step))
    }, { rootMargin: `-${window.innerHeight * .35}px 0px -${window.innerHeight * .45}px 0px`, threshold: 0 })
    refs.current.forEach(element => { if (element) observer.observe(element) })
    return () => observer.disconnect()
  }, [])

  return (
    <section className="landing-section feedback-journey" id="feedback-to-fix">
      <header className="journey-intro"><span>Feedback belongs with the work.</span><h2>Your team. Your feedback.<br />One place to move it forward.</h2><p>Capture it in context. Review it together.<br className="journey-desktop-break" /> Send it where your team gets work done.</p></header>
      <div className="journey-layout">
        <div className="journey-chapters">{chapters.map((chapter, index) => <article key={chapter.label} ref={element => { refs.current[index] = element }} data-step={index} className={step === index ? 'is-active' : ''}>
          <button type="button" onClick={() => setStep(index)} aria-pressed={step === index} aria-label={chapter.label}><chapter.Icon size={18} /><span>{chapter.label}</span><small>0{index + 1}</small></button>
          <h3>{chapter.title}</h3><p>{chapter.description}</p>
          <div className="journey-mobile"><JourneyStage step={index} /></div>
        </article>)}</div>
        <div className="journey-sticky"><JourneyStage step={step} /></div>
      </div>
    </section>
  )
}
