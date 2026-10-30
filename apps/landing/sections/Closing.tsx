import { ChromeLogo } from '../components/ChromeLogo'
import { CTAGroup } from '../../../src/design-system'
import { DASHBOARD_HREF } from './Hero'

const CHROME_HREF = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '/support#extension'

export function Closing() {
  return (
    <section className="landing-closing">
      <div>
        <p>Keep the comment attached to the outcome.</p>
        <h2>Your next fix<br />starts with a comment.</h2>
      </div>
      <div>
        <CTAGroup>
          <a className="ds-button ds-button-primary ds-button-lg" href={DASHBOARD_HREF}>Get started</a>
          <a className="ds-button ds-button-secondary ds-button-lg" href={CHROME_HREF}><ChromeLogo size={20} /> Add to Chrome</a>
        </CTAGroup>
        <small>14-day Cloud trial. Card required.</small>
      </div>
    </section>
  )
}
