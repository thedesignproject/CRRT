import { Puzzle } from 'lucide-react'
import { CTAGroup } from '../../../src/design-system'
import { tryCrrt } from '../lib/tryCrrt'

const CHROME_HREF = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '/support#extension'

export function Closing() {
  return (
    <section className="landing-closing">
      <div>
        <p>Keep the comment attached to the outcome.</p>
        <h2>Your product eye.<br />Executed.</h2>
      </div>
      <div>
        <CTAGroup>
          <a className="ds-button ds-button-primary ds-button-lg" href="#try-crrt" onClick={tryCrrt}>Try CRRT</a>
          <a className="ds-button ds-button-secondary ds-button-lg" href={CHROME_HREF}><Puzzle size={17} /> Add to Chrome</a>
        </CTAGroup>
        <small>Try the widget here. No account needed.</small>
      </div>
    </section>
  )
}
