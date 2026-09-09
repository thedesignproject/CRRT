import { DocsLayout } from '../DocsLayout'
import { Callout, CodeBlock, H2, H3, InlineCode, Ol, P, PropsTable, Section, Strong, Ul } from '../Prose'

interface SelfHostPageProps {
  pathname: string
  onNavigate: (path: string) => void
}

const cloneSnippet = `git clone https://github.com/thedesignproject/CRRT.git
cd CRRT
bun install`

const envSnippet = `cp .env.example .env

# Supabase (API + dashboard build):
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_KEY=<anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> # server-only; never expose in client code
REVIEWER_API_TOKEN=<long-random-string>
SHARE_TOKEN_SECRET=<long-random-string>

# client (landing build-time):
VITE_API_BASE=https://<your-app-url>/api`

const migrateSnippet = `bun run db:migrate`

const deploySnippet = `vercel deploy        # preview
vercel --prod        # production`

const smokeSnippet = `curl -s "$APP_URL/api/v1/public/comments?projectKey=demo-project"
# → [] on a fresh DB, or seeded comments if you ran \`bun db:seed\``

export function SelfHostPage({ pathname, onNavigate }: SelfHostPageProps) {
  return (
    <DocsLayout
      pathname={pathname}
      onNavigate={onNavigate}
      marker="self-host"
      title="Run your own CRRT."
      description="CRRT is OSS-first. crrt.ai is the easy path, but the same code runs on your own infra in under twenty minutes if you'd rather own the stack."
    >
      <Section>
        <H2>Hosted vs self-host</H2>
        <PropsTable
          rows={[
            {
              name: 'crrt.ai',
              type: 'managed',
              description: <>Sign up, create a project, paste the snippet. We run the API, the DB, and the agent bridge.</>,
            },
            {
              name: 'self-host',
              type: 'OSS',
              description: <>You run the API + dashboard + DB. Full control, no third-party data hop, paid tier features come built-in.</>,
            },
          ]}
        />
        <Callout tone="info">
          The OSS and hosted versions are the same code on the same trunk. You can switch from hosted to
          self-host (or back) by changing <InlineCode>apiBase</InlineCode> on the widget.
        </Callout>
      </Section>

      <Section>
        <H2>What you'll need</H2>
        <Ul>
          <li>
            <Strong>Postgres</Strong> for the data layer. Any provider works; we recommend{' '}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--crrt-carrot)' }}>
              Supabase
            </a>{' '}
            so you get auth + storage in the same place — that's what the hosted instance runs on.
          </li>
          <li>
            <Strong>A runtime</Strong> that can serve the Vercel-style serverless functions in{' '}
            <InlineCode>api/</InlineCode> plus the static builds in <InlineCode>apps/landing/</InlineCode>{' '}
            and <InlineCode>apps/dashboard/</InlineCode>. We deploy to Vercel; Fly, Render, Cloudflare
            Workers, or a Node container all work.
          </li>
          <li>
            <Strong>Bun ≥ 1.1</Strong> for the build commands (<InlineCode>bun install</InlineCode>,{' '}
            <InlineCode>bun run build</InlineCode>).
          </li>
        </Ul>
      </Section>

      <Section>
        <H2>1. Clone and install</H2>
        <CodeBlock language="bash" code={cloneSnippet} />
      </Section>

      <Section>
        <H2>2. Configure environment</H2>
        <P>
          Copy <InlineCode>.env.example</InlineCode> to <InlineCode>.env</InlineCode> and fill in the
          required values. The dashboard includes the public <InlineCode>SUPABASE_KEY</InlineCode> in its
          browser bundle at build time. Keep <InlineCode>SUPABASE_SERVICE_ROLE_KEY</InlineCode> server-only.
        </P>
        <CodeBlock language="bash" code={envSnippet} />
        <Callout tone="warn">
          <Strong>SUPABASE_SERVICE_ROLE_KEY</Strong>, <Strong>REVIEWER_API_TOKEN</Strong>, and{' '}
          <Strong>SHARE_TOKEN_SECRET</Strong> are sensitive — rotate them periodically and never commit or
          expose them to client code. The two application tokens should be long random strings (32+ bytes).
        </Callout>
      </Section>

      <Section>
        <H2>3. Apply the schema</H2>
        <P>
          The Drizzle schema lives in <InlineCode>db/schema.ts</InlineCode>; migrations are committed under{' '}
          <InlineCode>db/migrations/</InlineCode>. Run them once before your first deploy.
        </P>
        <CodeBlock language="bash" code={migrateSnippet} />
        <P>
          <InlineCode>deploy-build</InlineCode> runs <InlineCode>db:migrate</InlineCode> automatically on
          each deploy, so subsequent schema bumps apply themselves.
        </P>
      </Section>

      <Section>
        <H2>4. Deploy</H2>

        <H3>On Vercel</H3>
        <CodeBlock language="bash" code={deploySnippet} />
        <P>
          <InlineCode>vercel.json</InlineCode> sets <InlineCode>buildCommand</InlineCode> to{' '}
          <InlineCode>bun run deploy-build</InlineCode>, which typechecks, builds the landing app and
          dashboard into one output, and applies pending migrations.
        </P>

        <H3>On another runtime</H3>
        <P>
          The relevant outputs are:
        </P>
        <Ul>
          <li>
            <InlineCode>apps/landing/dist/</InlineCode> — static landing page.
          </li>
          <li>
            <InlineCode>apps/landing/dist/dashboard/</InlineCode> — static dashboard SPA (build with{' '}
            <InlineCode>bun run build:dashboard</InlineCode>).
          </li>
          <li>
            <InlineCode>api/</InlineCode> — Vercel-style serverless handlers using{' '}
            <InlineCode>@vercel/node</InlineCode>. Adapt them to your platform if needed.
          </li>
        </Ul>
      </Section>

      <Section>
        <H2>5. Smoke test</H2>
        <CodeBlock language="bash" code={smokeSnippet} />
        <P>
          You should get a JSON response. If you ran <InlineCode>bun db:seed</InlineCode>, a{' '}
          <InlineCode>demo-project</InlineCode> row already exists for testing the widget end-to-end.
        </P>
      </Section>

      <Section>
        <H2>Updates and versioning</H2>
        <P>
          <InlineCode>crrt.ai</InlineCode> runs whatever is on <InlineCode>trunk</InlineCode>. If you self-host,
          you can pin to a release tag (<InlineCode>git checkout v0.x.y</InlineCode>) for stability. We aim
          to keep the public API surface backward-compatible across minor versions. The Drizzle migrations
          are idempotent, so re-running <InlineCode>bun run db:migrate</InlineCode> after a fetch is safe.
        </P>
      </Section>

      <Section>
        <H2>Going further</H2>
        <P>
          <Strong>Custom branding</Strong> — replace the assets in{' '}
          <InlineCode>apps/landing/public/</InlineCode> and tweak{' '}
          <InlineCode>branding/crrt/tokens.css</InlineCode> if you want to white-label.
        </P>
        <P>
          <Strong>Custom auth</Strong> — the dashboard uses Supabase Auth out of the box. Swap{' '}
          <InlineCode>apps/dashboard/lib/supabase.ts</InlineCode> and{' '}
          <InlineCode>api/_lib/auth.ts</InlineCode> if you need a different provider.
        </P>
        <P>
          <Strong>Issues, questions, contributions</Strong> — open them on the GitHub repo. We track every
          one.
        </P>
      </Section>
    </DocsLayout>
  )
}
