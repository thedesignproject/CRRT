import { H2, H3, P, Section, Strong, Ul } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

export function PrivacyPage() {
  return (
    <LegalLayout
      marker="privacy"
      title="Privacy at CRRT"
      description="A plain-language account of what CRRT handles when you capture, review, and route visual feedback."
    >
      <P>Effective September 11, 2026. CRRT is operated by The Design Project LLC.</P>

      <Section>
        <H2>What this covers</H2>
        <P>
          This policy covers the CRRT Chrome extension and the connected CRRT dashboard services used to save,
          review, and route feedback. A project administrator controls who belongs to a project. Project membership
          authorizes access; a matching website domain only helps CRRT select the right project.
        </P>
      </Section>

      <Section>
        <H2>Data CRRT handles</H2>
        <H3>Account and session</H3>
        <P>
          CRRT handles your email address, account identifier, authentication session, project memberships, roles,
          and the local disclosure version you accepted. The extension stores its session and authorized destination
          preferences in Chrome extension storage, not Chrome Sync.
        </P>

        <H3>Chosen page context</H3>
        <P>
          When you open or activate CRRT, it reads the current HTTP(S) page URL and hostname to identify the feedback
          context and resolve an accessible project. CRRT does not collect your browsing history in the background.
        </P>

        <H3>Feedback and explicit capture</H3>
        <P>
          When you choose a target and submit feedback, CRRT can store the comment text, page URL and hostname,
          selected element or text anchor, viewport position and geometry, visibility, author, timestamps, review
          status, and an optional screenshot. Page content and screenshots are captured only after your explicit
          feedback action. CRRT does not use page data for unrelated advertising or sell user data.
        </P>

        <H3>Speech input</H3>
        <P>
          The microphone appears only when Chrome exposes the required speech-recognition capability and starts only
          when you press it. Chrome or its speech service may process the audio under Chrome's terms. CRRT receives
          the resulting transcript and stores it only as part of feedback you submit; CRRT does not store microphone
          audio.
        </P>

        <H3>Projects and visibility</H3>
        <P>
          Private feedback is available only to its creator. Shared project feedback is available to authorized
          project collaborators. Internal feedback is hidden from guests. A person who only knows the page URL does
          not gain access to project feedback.
        </P>

        <H3>External work</H3>
        <P>
          When an authorized internal collaborator requests a tracker draft, CRRT may send the feedback text and
          limited page context to the configured model provider to propose editable issue copy. GitHub, Linear, or
          Jira receives the fields shown in that draft only after the collaborator reviews and confirms the send.
          CRRT then stores the external work identifier, URL, destination, and synchronization status. Provider
          credentials stay on the CRRT server.
        </P>
      </Section>

      <Section>
        <H2>Service providers</H2>
        <P>CRRT uses service providers only to operate these product functions:</P>
        <Ul>
          <li><Strong>Supabase</Strong> for authentication, database records, and protected screenshot storage.</li>
          <li><Strong>Vercel</Strong> for application hosting and server execution.</li>
          <li><Strong>Resend</Strong> for invitation and feedback-notification email.</li>
          <li><Strong>A configured model provider</Strong> for an editable tracker draft when an authorized collaborator requests one.</li>
          <li><Strong>GitHub, Linear, and Atlassian Jira</Strong> only when a project connects that provider and an authorized collaborator confirms a send.</li>
        </Ul>
        <P>CRRT does not download or execute remote code inside the extension.</P>
      </Section>

      <Section>
        <H2>Retention and deletion</H2>
        <Ul>
          <li>Extension sign-in handoff codes expire after five minutes; hashed handoff metadata is scheduled for removal after 24 hours.</li>
          <li>Local session and preference data remains until it expires, you sign out, change the preference, clear extension data, or uninstall CRRT.</li>
          <li>Feedback and protected screenshots remain until the feedback owner deletes them or an authorized deletion request is completed.</li>
          <li>Connected-provider records remain until an authorized project administrator disconnects the integration or an authorized deletion request is completed.</li>
        </Ul>
        <P>
          You can delete feedback you own and disconnect project integrations from CRRT. For account-level deletion or
          records you cannot access, email <LegalLink href="mailto:hello@designproject.io">hello@designproject.io</LegalLink>
          {' '}from the address associated with your account. We may need to verify your identity and project authority.
        </P>
      </Section>

      <Section>
        <H2>Security and your choices</H2>
        <P>
          CRRT sends service data over HTTPS. Screenshots captured by the extension are stored in protected storage
          and delivered through short-lived signed URLs. Service-role credentials, provider secrets, and raw
          one-time handoff codes are not included in the extension bundle.
        </P>
        <P>
          You can choose Private instead of a project, omit screenshots, avoid speech input, disconnect external
          providers, sign out, delete feedback you own, or uninstall the extension. These choices may limit the
          corresponding product function.
        </P>
      </Section>

      <Section>
        <H2>Contact</H2>
        <P>
          For privacy questions, access or deletion requests, or a suspected security incident, contact{' '}
          <LegalLink href="mailto:hello@designproject.io">hello@designproject.io</LegalLink>. Do not include passwords,
          session tokens, provider secrets, or sensitive page content in your first message.
        </P>
        <P>Material changes to extension data practices require a new disclosure version before further capture.</P>
      </Section>
    </LegalLayout>
  )
}
