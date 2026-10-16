import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { FakeDashboard } from './sections/FakeDashboard'
import { Closing } from './sections/Closing'
import { Pricing } from './sections/Pricing'
import { ProductAudit } from './sections/ProductAudit'
import { Footer } from './sections/Footer'

/** Shared by the interactive app and the build-time HTML renderer. */
export function MarketingPage({ authenticated = false, accessToken, apiBase }: { authenticated?: boolean; accessToken?: string; apiBase?: string }) {
  return (
    <>
      <Hero authenticated={authenticated} />
      <HowItWorks />
      <FakeDashboard />
      <ProductAudit />
      <Closing />
      <Pricing authenticated={authenticated} accessToken={accessToken} apiBase={apiBase} />
      <Footer />
    </>
  )
}
