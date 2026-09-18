import { H2, H3, Ol, P, Section, Strong, Ul } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

export function SupportPage() {
  return (
    <LegalLayout
      marker="support"
      title="CRRT support"
      description="Get from installation to shared, contextual feedback—and recover cleanly when something gets in the way."
    >
      <Section>
        <H2>Start commenting</H2>
        <Ol>
          <li>Install CRRT in Chrome and pin it to the toolbar.</li>
          <li>Open the extension, review the first-run disclosure, then sign in or create your CRRT account.</li>
          <li>Open a regular HTTP(S) product page and choose <Strong>Start commenting</Strong>.</li>
          <li>Confirm the destination and audience, select the page target, add your feedback, and submit.</li>
        </Ol>
        <P>
          Chrome does not allow extensions to inject into browser settings, the Chrome Web Store, or other protected
          pages. Open the product's normal web page when CRRT reports that a page is restricted.
        </P>
      </Section>

      <Section>
        <H2>Join a client's project</H2>
        <P>
          A project owner or admin invites you by email. Accept the invitation using the same email address, install
          CRRT, and sign in. When exactly one project you can access matches the current hostname, CRRT selects it
          automatically. If multiple projects match, choose the destination in the extension. Knowing a page URL by
          itself does not grant access.
        </P>
        <P>
          Guests can create and view shared feedback for their project pages. Internal feedback, Agent controls,
          repository settings, and integration controls remain available only to authorized internal collaborators.
        </P>
      </Section>

      <Section>
        <H2>Common recovery paths</H2>
        <H3>Sign-in expired or failed</H3>
        <P>Open the extension and use <Strong>Sign in with CRRT</Strong> again. Complete the hosted flow in the window Chrome opens.</P>

        <H3>No project appears</H3>
        <P>
          You can continue with Private feedback. To collaborate, ask a project owner to invite your CRRT account or
          create/configure the project in the hosted dashboard.
        </P>

        <H3>The wrong destination appears</H3>
        <P>
          Open the extension on that hostname and choose another accessible project or Private. Domain matching helps
          resolve a destination; it never changes membership permissions.
        </P>

        <H3>GitHub, Linear, or Jira needs attention</H3>
        <P>
          A project admin reconnects the provider from project settings in the CRRT dashboard. A failed tracker send
          does not delete the original feedback; retry from the saved feedback after the connection is healthy.
        </P>
      </Section>

      <Section>
        <H2>Delete data or report a problem</H2>
        <Ul>
          <li>Delete feedback you own from the on-page CRRT surface or My comments in the dashboard.</li>
          <li>Project administrators can disconnect GitHub, Linear, and Jira from project settings.</li>
          <li>Sign out from the extension to remove its active local session, or uninstall it to remove extension-local data.</li>
        </Ul>
        <P>
          For account-level deletion, inaccessible records, installation help, or a suspected security incident,
          email <LegalLink href="mailto:hello@designproject.io">hello@designproject.io</LegalLink>. Include your CRRT
          account email, the affected project name, what happened, and any request ID shown by CRRT. Do not send
          passwords, session tokens, provider secrets, or sensitive screenshots.
        </P>
        <P>
          Read the <LegalLink href="/privacy">CRRT privacy policy</LegalLink> for the complete data inventory and controls.
        </P>
      </Section>
    </LegalLayout>
  )
}
