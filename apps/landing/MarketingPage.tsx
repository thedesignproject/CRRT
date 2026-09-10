import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { FakeDashboard } from './sections/FakeDashboard'
import { Closing } from './sections/Closing'
import { Pricing } from './sections/Pricing'
import { ProductAudit } from './sections/ProductAudit'
import { Footer } from './sections/Footer'

/** Shared by the interactive app and the build-time HTML renderer. */
export function MarketingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FakeDashboard />
      <ProductAudit />
      <Closing />
      <Pricing />
      <Footer />
    </>
  )
}
