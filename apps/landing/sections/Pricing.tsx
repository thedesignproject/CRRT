import { useReveal } from '../lib/useReveal'

const plans = [
  { name:'Community', price:'Free', delivery:'Self-hosted', features:['Complete open-source product','No commercial project, user, comment or audit limits','Bring your own hosting, storage and provider credentials'], href:'https://github.com/thedesignproject/CRRT', action:'Run Community' },
  { name:'Cloud Pro', price:'$19 / month', delivery:'Managed Cloud', features:['10 projects · 10 internal users','Unlimited guests','2,000 new comments / month','5 Product Audits / month','Dashboard, widget, extension sync and integrations'], href:'/dashboard/billing', action:'Start a 14-day trial' },
  { name:'Cloud Studio', price:'$49 / month', delivery:'Managed Cloud', features:['50 projects · 25 internal users','Unlimited guests','10,000 new comments / month','30 Product Audits / month','Everything in Cloud Pro, with more capacity'], href:'/dashboard/billing', action:'Start a 14-day trial' },
]
export function Pricing() {
  const reveal=useReveal<HTMLDivElement>()
  return <section style={{background:'var(--crrt-bg-deep)',padding:'120px 32px',borderTop:'1px solid var(--crrt-rule-dark)'}}>
    <div ref={reveal.ref} className={`mx-auto ${reveal.className}`} style={{maxWidth:1120}}>
      <span className="section-marker">/ 06 pricing</span>
      <h2 style={{fontFamily:'var(--crrt-font-mono)',fontSize:'var(--crrt-text-h2)',color:'var(--crrt-white)',margin:'24px 0 40px'}}>Run it yourself. Or let us host it.</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map(plan=><article key={plan.name} className="hover-lift" style={{background:'var(--crrt-bg-deep-soft)',border:'1px solid var(--crrt-rule-dark)',borderRadius:'var(--crrt-radius-2xl)',padding:32}}>
          <h3 style={{color:'var(--crrt-white)',fontSize:20}}>{plan.name}</h3>
          <p style={{color:'var(--crrt-carrot)',fontSize:24,margin:'16px 0'}}>{plan.price}</p>
          <p style={{color:'var(--crrt-ink-faint)'}}>{plan.delivery}</p>
          <ul style={{color:'var(--crrt-ink-faint)',paddingLeft:16,margin:'24px 0',fontSize:14,lineHeight:1.8}}>{plan.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
          <a href={plan.href} className="inline-block rounded-full border px-5 py-3 text-sm" style={{borderColor:'var(--crrt-rule-dark-strong)',color:'var(--crrt-white)'}}>{plan.action}</a>
        </article>)}
      </div>
      <p style={{color:'var(--crrt-ink-faint)',fontSize:14,marginTop:24}}>Cloud trials require a payment method. No charge until day 14. Taxes are added at checkout when applicable. Members and guests do not need separate subscriptions.</p>
      <p style={{color:'var(--crrt-ink-faint)',fontSize:14,marginTop:16}}>Try the extension locally: one project, one user, up to 50 stored comments and export. Cloud storage, collaboration and sync start with a Cloud plan.</p>
    </div>
  </section>
}
