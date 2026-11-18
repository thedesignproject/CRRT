import { H2, P, Section, Ul } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

export function TermsPage() {
  return (
    <LegalLayout
      marker="terms"
      title="CRRT terms of service"
      description="The terms for using CRRT Cloud, the CRRT browser extension, and CRRT connections to AI assistants."
    >
      <P>Effective November 17, 2026. CRRT is operated by The Design Project LLC (&quot;we&quot;).</P>

      <Section>
        <H2>Using CRRT</H2>
        <P>
          These terms apply when you use CRRT Cloud, the CRRT browser extension, the CRRT dashboard, or connect CRRT to
          an AI assistant. By using CRRT you agree to them. If you use CRRT for an organization, you confirm that you
          can accept these terms on its behalf.
        </P>
        <P>
          The self-hosted CRRT Community edition is licensed under the Apache License 2.0. These terms do not limit
          that license; they cover the services we operate.
        </P>
      </Section>

      <Section>
        <H2>Your account</H2>
        <P>
          Keep your sign-in credentials secure and tell us promptly about unauthorized use. You are responsible for
          activity in your account, including actions you ask a connected AI assistant to take.
        </P>
      </Section>

      <Section>
        <H2>Your content</H2>
        <P>
          You keep ownership of the feedback, screenshots, documents, recordings, and other content you submit. You
          give us permission to store, process, and display that content only as needed to operate CRRT for you and
          the people you share it with. Our <LegalLink href="/privacy">privacy policy</LegalLink> explains how we
          handle personal data.
        </P>
        <P>Only submit content you have the right to share, and only capture pages you are allowed to review.</P>
      </Section>

      <Section>
        <H2>AI assistant connections</H2>
        <P>
          You can connect CRRT to AI assistants such as ChatGPT or Claude through CRRT&apos;s MCP server. A connection
          acts with your account&apos;s roles, project membership, and plan, limited to the permissions you approve.
          Review what an assistant proposes before asking it to change, publish, share, or delete anything. AI output
          can be wrong. Code changes prepared from CRRT feedback still need human review before they are merged. You
          can revoke a connection at any time from the MCP connections page in your dashboard.
        </P>
      </Section>

      <Section>
        <H2>Acceptable use</H2>
        <P>Do not use CRRT to:</P>
        <Ul>
          <li>break the law or infringe the rights of others;</li>
          <li>access projects, accounts, or data you are not authorized to access;</li>
          <li>upload malware or attempt to disrupt, probe, or overload the service;</li>
          <li>collect personal data about others without a lawful basis; or</li>
          <li>resell or provide CRRT Cloud to third parties without our written agreement.</li>
        </Ul>
      </Section>

      <Section>
        <H2>Plans and billing</H2>
        <P>
          Paid CRRT Cloud plans are purchased and managed in the CRRT dashboard. Payments are processed by Stripe.
          Plan features, limits, and renewal terms are shown when you subscribe. You can cancel renewal from the
          dashboard; access continues until the end of the paid period.
        </P>
      </Section>

      <Section>
        <H2>Changes and availability</H2>
        <P>
          We may change or discontinue features. We will give reasonable notice of material changes to these terms
          by updating this page and, where appropriate, by email. Continued use after a change takes effect means
          you accept the updated terms.
        </P>
      </Section>

      <Section>
        <H2>Suspension and termination</H2>
        <P>
          You can stop using CRRT and request account deletion at any time. We may suspend or end access if you
          breach these terms or if needed to protect the service or other users. Sections about your content,
          disclaimers, and liability continue after termination.
        </P>
      </Section>

      <Section>
        <H2>Disclaimers and liability</H2>
        <P>
          CRRT is provided &quot;as is&quot; and &quot;as available&quot;. To the extent permitted by law, we disclaim implied
          warranties, including merchantability, fitness for a particular purpose, and non-infringement. To the
          extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive
          damages, and our total liability for any claim is limited to the amount you paid us for CRRT in the twelve
          months before the claim.
        </P>
      </Section>

      <Section>
        <H2>Contact</H2>
        <P>
          Questions about these terms: <LegalLink href="mailto:hello@designproject.io">hello@designproject.io</LegalLink>.
        </P>
      </Section>
    </LegalLayout>
  )
}
