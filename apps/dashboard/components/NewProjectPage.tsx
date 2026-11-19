import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CommandBlock, ConnectionStatus, InlineCode, PromptBlock, SegmentedTabs } from '@crrt/ui/crrt'
import type { ProjectKeyAvailability } from '../api'
import { route } from '../lib/routes'
import { isValidProjectKey, slugify } from '../lib/utils'

const METHODS = ['Prompt', 'MCP'] as const
// Studio input styling; Base UI's Input would pull a second React into the dashboard bundle.
const inputClass = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
type Method = (typeof METHODS)[number]
type KeyStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken'

/** The one prompt a coding agent needs to install the widget for this project. */
export function setupPrompt(projectId: string) {
  return `Set up CRRT visual feedback in this React app.

1. Install @thedesignproject/crrt with the project's package manager.
2. Render <FeedbackWidget projectId="${projectId}" /> once at the root so it shows on every page. Check package.json for the framework: in Next.js App Router, wrap it in a client component inside <body> in app/layout.tsx.
3. If the app owns light/dark theme state, pass it to the theme prop. Otherwise leave theme out.
4. Add a note to AGENTS.md: "Review feedback for this app lives in CRRT, project ${projectId}."

Follow the existing conventions. Don't refactor unrelated code.`
}

interface NewProjectPageProps {
  apiBase: string
  /** First project of the account: the copy welcomes instead of adding. */
  first?: boolean
  checkAvailability: (key: string) => Promise<ProjectKeyAvailability>
  /** Creates the project; resolves false when the server refused it. */
  onCreate: (projectKey: string, name: string) => Promise<boolean>
  error?: string | null
  /** Set when the account needs a plan before it can create projects. */
  planRequired?: { label: string }
  /** The created project already received its first pin. */
  firstPin?: boolean
  onOpenProject: () => void
  suggestedProjects?: ReactNode
}

/**
 * "New project" as a page. Name it, then hand your coding agent one prompt with the
 * project ID inside. Copying the prompt creates the project, so the ID is real by the
 * time the agent uses it.
 */
export function NewProjectPage({ apiBase, first = false, checkAvailability, onCreate, error, planRequired, firstPin = false, onOpenProject, suggestedProjects }: NewProjectPageProps) {
  const [method, setMethod] = useState<Method>('Prompt')
  const [name, setName] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const [suggestion, setSuggestion] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const creating = useRef(false)
  const latestKey = useRef('')
  const key = createdId ?? override ?? slugify(name)
  const projectId = key || 'your-project'

  // Debounced availability check while the ID can still change.
  useEffect(() => {
    if (createdId) return
    if (!key) { setStatus('idle'); return }
    if (!isValidProjectKey(key)) { setStatus('invalid'); return }
    setStatus('checking')
    latestKey.current = key
    const timer = setTimeout(() => {
      checkAvailability(key).then(
        (result) => {
          if (latestKey.current !== key) return
          setSuggestion(result.suggestion)
          setStatus(result.available ? 'available' : 'taken')
        },
        () => { if (latestKey.current === key) setStatus('idle') },
      )
    }, 400)
    return () => clearTimeout(timer)
  }, [key, createdId, checkAvailability])

  const ready = createdId !== null || (status === 'available' && name.trim() !== '')

  async function create() {
    if (createdId || creating.current || !ready) return
    creating.current = true
    const ok = await onCreate(key, name.trim())
    creating.current = false
    if (ok) setCreatedId(key)
  }

  const ask = `Set up CRRT here as project ${projectId}.`
  const mcpUrl = new URL(`${apiBase.replace(/\/$/, '')}/mcp/v1`, window.location.origin).href
  const promptHeader = (text: string) => <span className="px-1.5 font-medium text-text-body">{text}</span>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-170 flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text-strong">{first ? 'Create your first project' : 'New project'}</h1>
          <p className="text-text-body">Name it, then your coding agent installs CRRT with this project’s ID. Paste a prompt, or connect MCP once.</p>
        </header>

        {planRequired ? (
          <div className="flex flex-col items-start gap-3 rounded-lg p-4 ring-1 ring-border">
            <p className="text-sm text-text-body">Projects need an active plan. You can try CRRT free before you pay.</p>
            <a href={route('/billing')} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80">{planRequired.label}</a>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-sm font-medium text-text-strong">Project name</label>
              <input id="project-name" className={inputClass} aria-invalid={status === 'invalid' || status === 'taken'} autoFocus value={name} placeholder="Acme Marketing" onChange={(e) => { setName(e.target.value); setOverride(null) }} />
              <p className="text-xs text-text-subtle" aria-live="polite">
                Project ID <span className="font-mono text-text-body">{projectId}</span>
                {createdId ? <> · created, it’s in your sidebar. Renaming keeps this ID.</>
                  : status === 'checking' ? <> · checking…</>
                  : status === 'invalid' ? <> · use lowercase letters, numbers and single hyphens</>
                  : status === 'taken' ? <> · taken.{suggestion && <> <button type="button" className="font-medium text-text-strong hover:underline" onClick={() => setOverride(suggestion)}>Use {suggestion}</button></>}</>
                  : null}
              </p>
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            </div>

            <section aria-label="Install" className="flex flex-col gap-3">
              <SegmentedTabs label="Setup method" options={METHODS} value={method} onChange={setMethod} />
              {method === 'Prompt' ? (
                <PromptBlock highlight={[projectId]} prompt={setupPrompt(projectId)} disabled={!ready} onCopy={() => { void create() }} header={promptHeader('Paste this into your coding agent')} />
              ) : (
                <>
                  <CommandBlock
                    command={`claude mcp add --transport http --scope user crrt ${mcpUrl}`}
                    steps={[
                      <>Run it in your terminal once per machine, then restart the agent in your repo. Using another client? See <a className="font-medium text-text-strong hover:underline" href={route('/mcp-auth')}>MCP connections</a>.</>,
                      <>Ask it: <InlineCode>{ask}</InlineCode></>,
                    ]}
                  />
                  <PromptBlock highlight={[projectId]} prompt={ask} disabled={!ready} onCopy={() => { void create() }} header={promptHeader('Ask your agent')} />
                </>
              )}
              {createdId && (firstPin ? (
                <ConnectionStatus state="connected" message={<>First pin received on <InlineCode>{createdId}</InlineCode>. <button type="button" className="font-medium text-text-strong hover:underline" onClick={onOpenProject}>Open the project →</button></>} />
              ) : (
                <ConnectionStatus state="waiting" waitingFor={<>Waiting for the first pin on <InlineCode>{createdId}</InlineCode></>} hint="Open your app and click the carrot." />
              ))}
            </section>

            <p className="text-sm text-text-subtle">Reviewing a Storybook? Add it to any project later in Settings.</p>
          </>
        )}

        {suggestedProjects && (
          <>
            <div className="flex items-center gap-3 text-xs text-text-subtle" role="separator">
              <span className="h-px flex-1 bg-border" />
              or join your team’s project
              <span className="h-px flex-1 bg-border" />
            </div>
            {suggestedProjects}
          </>
        )}
      </div>
    </div>
  )
}
