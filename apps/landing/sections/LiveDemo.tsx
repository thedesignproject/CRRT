import { MessageCircle } from 'lucide-react'
import { tryCrrt } from '../lib/tryCrrt'

export function LiveDemo() {
  return (
    <section id="try-crrt" tabIndex={-1} aria-labelledby="try-crrt-title" className="landing-section landing-live-demo">
      <div>
        <h2 id="try-crrt-title">Your turn. Leave a little feedback.</h2>
        <p>Pick any text, button, or image on this page. Tell us what you would change, then see your comment pinned to the exact spot.</p>
        <button type="button" className="ds-button ds-button-primary ds-button-lg" onClick={tryCrrt}><MessageCircle size={18} /> Leave feedback</button>
        <small>This is the real CRRT widget. Demo comments stay in this tab and are not sent to our team. No account needed.</small>
      </div>
      <div className="landing-demo-target">
        <span>Something to try</span>
        <h3>Your next release starts with one comment.</h3>
        <p>Too much copy? A headline you would rewrite? Select something here and leave your first comment.</p>
      </div>
    </section>
  )
}
