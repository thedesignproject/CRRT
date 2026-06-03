import { DocsLayout } from '../DocsLayout'
import { Callout, CodeBlock, H2, H3, InlineCode, NextStep, Ol, P, Section, Strong, Ul } from '../Prose'

interface AgentHandoffPageProps {
  pathname: string
  onNavigate: (path: string) => void
}

const shareCreateSnippet = `POST /api/v1/feedback-shares
Authorization: Bearer <REVIEWER_API_TOKEN>
Content-Type: application/json

{
  "projectId": "proj_acme_marketing",
  "scopeType": "selection",
  "commentIds": ["..."]
}

→ 201 Created
{
  "shareId": "...",
  "slug": "...",
  "token": "...",
  "tokenUrl": "https://crrt.ai/api/v1/agent/shares/.../state?token=..."
}`

const promptFetchSnippet = `GET /api/v1/feedback-shares/<shareId>/prompt?target=claude-code
Authorization: Bearer <REVIEWER_API_TOKEN>

→ 200 OK
{
  "prompt": "You are reviewing the Ready-for-Agent items at <tokenUrl>...\\n…",
  "tokenUrl": "..."
}`

const agentStateSnippet = `GET /api/v1/agent/shares/<slug>/state
Authorization: Bearer <share-token>

→ 200 OK
{
  "share": { "id": "...", "scopeType": "selection", ... },
  "project": { "publicKey": "...", "name": "...", ... },
  "comments": [
    {
      "id": "...",
      "body": "El contraste del CTA contra el fondo no pasa AA.",
      "selector": "button.cta-primary",
      "pageUrl": "https://acme.test/pricing",
      "reviewStatus": "accepted",
      "implementationStatus": "unassigned"
    }
  ],
  "presence": [],
  "capabilities": { "presence": true, "ops": true }
}`

export function AgentHandoffPage({ pathname, onNavigate }: AgentHandoffPageProps) {
  return (
    <DocsLayout
      pathname={pathname}
      onNavigate={onNavigate}
      marker="agent-handoff"
      title="Hand off feedback to your AI agent."
      description="Review feedback in the dashboard, mark items Ready for Agent, copy a prompt, and let Claude Code or Codex work the queue."
    >
      <Section>
        <H2>The loop</H2>
        <Ol>
          <li>
            Your customer drops a CRRT on your app via the widget. The comment lands in the dashboard with{' '}
            <Strong>Open</Strong> status.
          </li>
          <li>
            You triage it — accept, reject, or leave open. Accepted items move to{' '}
            <Strong>Ready for Agent</Strong>.
          </li>
          <li>
            Open the <Strong>Agent handoff</Strong> sidebar. The hero shows your count of ready items and a
            single CTA: <InlineCode>Send N crrts to &lt;agent&gt;</InlineCode>.
          </li>
          <li>
            Click <Strong>Send</Strong>. The dashboard generates a scoped prompt and copies it to your
            clipboard. Pick the agent (Claude Code, Codex, generic) from the caret on the right.
          </li>
          <li>
            Paste the prompt in your agent. It reads only the Ready items via a per-share bearer token,
            claims them, fixes them, and marks them <Strong>Done</Strong>.
          </li>
          <li>
            The sidebar reflects the queue live — claimed, working, done — as the agent reports back.
          </li>
        </Ol>
      </Section>

      <Section>
        <H2>Supported agents</H2>
        <P>
          The dashboard generates the prompt for each target. The agent doesn't need a special integration —
          it just needs to read the share token URL we put in the prompt and call the agent API.
        </P>
        <Ul>
          <li>
            <Strong>Claude Code</Strong> — paste in the chat. The prompt embeds the share URL and tells
            Claude Code which tools to use to fetch, claim, and update comments.
          </li>
          <li>
            <Strong>Codex</Strong> — paste in the prompt area. Same shape, different formatting.
          </li>
          <li>
            <Strong>Generic</Strong> — for Cursor, Windsurf, Cline, or any tool that accepts a free-form
            prompt. Same data, less tool-specific syntax.
          </li>
        </Ul>
      </Section>

      <Section>
        <H2>Under the hood</H2>
        <P>
          The handoff is mediated by a <Strong>feedback share</Strong>: a per-handoff record that bundles a
          set of comments, a scope (page, selection, or whole project), an expiry, and a one-time bearer
          token. The agent only ever sees the comments inside the share — nothing else from the project.
        </P>

        <H3>1. Create a share</H3>
        <CodeBlock language="http" code={shareCreateSnippet} />
        <P>
          The dashboard does this for you automatically when you click <Strong>Send</Strong>. You can also
          call the endpoint directly if you're scripting your own workflow.
        </P>

        <H3>2. Generate the prompt</H3>
        <CodeBlock language="http" code={promptFetchSnippet} />
        <P>
          Choose <InlineCode>target=claude-code</InlineCode>, <InlineCode>codex</InlineCode>, or{' '}
          <InlineCode>generic</InlineCode>. The returned prompt embeds the share URL plus instructions
          tailored to that agent.
        </P>

        <H3>3. Agent reads the share</H3>
        <CodeBlock language="http" code={agentStateSnippet} />
        <P>
          The agent fetches the state, claims comments (<InlineCode>POST .../presence</InlineCode>,{' '}
          <InlineCode>POST .../ops</InlineCode>), reports progress, and marks each item Done when it ships
          the fix. The dashboard polls and renders the same state live.
        </P>

        <Callout tone="info">
          The bearer token in the share URL is scoped to that share only. Revoke a share and the agent
          immediately loses access — useful if you ever need to stop a job mid-flight.
        </Callout>
      </Section>

      <Section>
        <H2>Custom integrations</H2>
        <P>
          If you're building your own agent or a different review tool, integrate against the agent API
          directly. The endpoints are documented in the <InlineCode>README</InlineCode> under{' '}
          <InlineCode>/api/v1/agent/...</InlineCode>. Anything that can speak HTTP and respect a bearer token
          can participate in the loop.
        </P>
      </Section>

      <NextStep href="/docs/self-host" label="run your own CRRT instance" onNavigate={onNavigate} />
    </DocsLayout>
  )
}
