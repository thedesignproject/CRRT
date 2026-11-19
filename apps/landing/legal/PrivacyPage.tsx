import { H2, H3, P, Section, Strong, Ul } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

export function PrivacyPage() {
  return (
    <LegalLayout
      marker="privacy"
      title="Privacy at CRRT"
      description="A plain-language account of what CRRT handles when you capture, review, and route visual feedback."
    >
      <P>Effective November 19, 2026. CRRT is operated by The Design Project LLC.</P>

      <Section>
        <H2>What this covers</H2>
        <P>
          This policy covers the CRRT Chrome extension, including CRRT Record screen recordings, the crrt.ai website
          and dashboard, the CRRT services used to save, review, and route feedback, and CRRT connections to AI
          assistants through the CRRT MCP server. A project administrator controls who belongs to a project. Project membership
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
        <P>
          When you use the extension without signing in, feedback and screenshot blobs stay in that browser's
          extension storage. CRRT sends those records to a Cloud project only after you sign in, review the project,
          item count, screenshot count, and quota impact, and confirm import. A verified import does not remove the
          local copies unless you separately choose to delete them.
        </P>

        <H3>Billing</H3>
        <P>
          For managed Cloud plans, CRRT stores the selected plan, subscription state, billing period, usage totals,
          and Stripe customer/subscription references. Stripe collects and processes payment-method, tax, invoice,
          and transaction information under its own terms. CRRT does not receive or store full card numbers.
        </P>

        <H3>Speech input</H3>
        <P>
          The microphone appears only when Chrome exposes the required speech-recognition capability and starts only
          when you press it. Chrome or its speech service may process the audio under Chrome's terms. CRRT receives
          the resulting transcript and stores it only as part of feedback you submit; CRRT does not store the audio
          of spoken comments.
        </P>

        <H3>Screen recordings (CRRT Record)</H3>
        <P>
          Recording starts only when you choose to record. CRRT captures the tab, window, or screen you select in
          Chrome&apos;s picker and, only if you turn them on, your camera and microphone. The recording is kept in
          the extension first. When you are signed in, CRRT uploads the screen video, camera video, and audio to CRRT
          storage when the recording ends. They are processed on CRRT servers to create playback
          files and thumbnails. The audio is sent to Deepgram to create a transcript. CRRT stores the recording, its
          transcript, title, duration, and the project it belongs to.
        </P>
        <P>
          Each uploaded recording has a share link. Anyone who has the link can watch the recording until you turn
          sharing off or delete the recording. When you ask a connected AI
          assistant for recording context, it can receive the transcript and a playback link that expires after five
          minutes.
        </P>

        <H3>Project audits</H3>
        <P>
          When an authorized collaborator starts a project audit, CRRT loads the public pages of the project&apos;s
          website and sends their text to OpenAI to draft review findings. Audits do not use signed-in sessions or
          private pages.
        </P>

        <H3>Website and dashboard analytics</H3>
        <P>
          The crrt.ai website and dashboard use PostHog for product analytics: page views and specific product
          actions, such as creating a project or changing a feedback status. When you are signed in, these events are
          linked to your account ID and email address. CRRT removes query strings and fragments from recorded URLs,
          and does not collect page content, feedback text, or form input. Vercel Speed Insights measures page
          performance on crrt.ai without query strings or fragments. The extension does not send analytics.
        </P>

        <H3>Projects and visibility</H3>
        <P>
          Private feedback is available only to its creator. Shared project feedback is available to authorized
          project collaborators. Internal feedback is hidden from guests. A person who only knows the page URL does
          not gain access to project feedback.
        </P>

        <H3>AI assistant connections</H3>
        <P>
          When you connect an AI assistant such as ChatGPT or Claude to CRRT, you sign in to CRRT in your browser and
          approve the requested permissions. CRRT never receives your assistant account password, and the assistant
          never receives your CRRT password. CRRT stores only hashed connection credentials; access credentials
          expire after 15 minutes and are refreshed while the connection remains active.
        </P>
        <P>
          The assistant receives the results of the CRRT tools it calls on your behalf, limited to data your account
          can already access. Depending on the request, results can include project names, feedback text, page URLs,
          anchor context, short-lived screenshot links, document content, recording transcripts, and project member
          names and email addresses. The assistant&apos;s provider processes that data under its own terms and privacy
          policy. CRRT does not send billing or payment details through these connections.
        </P>
        <P>
          For security and reliability, CRRT logs each tool call with your account identifier, the tool name, the
          number of results, timing, and any failure category. These logs do not include tool inputs or results.
        </P>

        <H3>External work</H3>
        <P>
          When an authorized internal collaborator requests a tracker draft, CRRT may send the feedback text and
          limited page context to OpenAI to propose editable issue copy. GitHub, Linear, or
          Jira receives the fields shown in that draft only after the collaborator reviews and confirms the send.
          CRRT then stores the external work identifier, URL, destination, and synchronization status. Provider
          credentials stay on the CRRT server.
        </P>
      </Section>

      <Section>
        <H2>Service providers</H2>
        <P>CRRT uses service providers only to operate these product functions:</P>
        <Ul>
          <li><Strong>Supabase</Strong> for authentication, database records, and protected screenshot and recording storage.</li>
          <li><Strong>Cloudflare R2</Strong> for recording storage.</li>
          <li><Strong>Vercel</Strong> for application hosting, server execution, recording processing, and Speed Insights.</li>
          <li><Strong>Stripe</Strong> for Cloud Checkout, subscriptions, payment recovery, invoices, tax configuration, and the billing portal.</li>
          <li><Strong>Resend</Strong> for invitation and feedback-notification email.</li>
          <li><Strong>Deepgram</Strong> for recording transcripts.</li>
          <li><Strong>OpenAI</Strong> for editable tracker drafts and project audits when an authorized collaborator requests them.</li>
          <li><Strong>PostHog</Strong> for website and dashboard product analytics.</li>
          <li><Strong>GitHub, Linear, and Atlassian Jira</Strong> only when a project connects that provider and an authorized collaborator confirms a send.</li>
          <li><Strong>The AI assistant you connect</Strong>, such as OpenAI ChatGPT or Anthropic Claude, which receives the tool results described above only after you connect it.</li>
        </Ul>
        <P>CRRT does not download or execute remote code inside the extension.</P>
      </Section>

      <Section>
        <H2>Retention and deletion</H2>
        <Ul>
          <li>Extension sign-in handoff codes expire after five minutes; hashed handoff metadata is scheduled for removal after 24 hours.</li>
          <li>Local session and preference data remains until it expires, you sign out, change the preference, clear extension data, or uninstall CRRT.</li>
          <li>Signed-out local feedback remains in extension storage until you delete it, clear browser data, or uninstall CRRT, including after a successful import unless you confirm local cleanup.</li>
          <li>Feedback and protected screenshots remain until the feedback owner deletes them or an authorized deletion request is completed.</li>
          <li>Recordings and their transcripts remain until the recording owner deletes them or an authorized deletion request is completed.</li>
          <li>Connected-provider records remain until an authorized project administrator disconnects the integration or an authorized deletion request is completed.</li>
          <li>AI assistant connections remain until they expire or you revoke them from the MCP connections page in your CRRT dashboard. Revoking takes effect immediately. Data an assistant already received is retained by its provider under that provider&apos;s policy.</li>
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
          You can choose Private instead of a project, omit screenshots, avoid speech input, record without camera or
          microphone, turn off recording share links, disconnect external
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
