import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { Closing } from './sections/Closing'
import { Pricing } from './sections/Pricing'
import { Footer } from './sections/Footer'
import { InstallPaths } from './sections/InstallPaths'
import { ProductProof } from './sections/ProductProof'
import { FAQ } from './sections/FAQ'
import { Integrations } from './sections/Integrations'
import { Reviews } from './sections/Reviews'

/** Shared by the interactive app and the build-time HTML renderer. */
export function MarketingPage({ authenticated = false, accessToken, apiBase }: { authenticated?: boolean; accessToken?: string; apiBase?: string }) {
  return (
    <>
      <Hero authenticated={authenticated} />
      <HowItWorks />
      <InstallPaths />
      <ProductProof />
      <Integrations />
      <Reviews />
      <Pricing authenticated={authenticated} accessToken={accessToken} apiBase={apiBase} />
      <FAQ />
      <Closing />
      <Footer />
    </>
  )
}
