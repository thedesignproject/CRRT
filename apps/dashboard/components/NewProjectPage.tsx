import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CommandBlock, ConnectionStatus, InlineCode, PromptBlock, SegmentedTabs } from '@crrt/ui/crrt'
import type { ProjectKeyAvailability } from '../api'
import { route } from '../lib/routes'
import { setupPrompt } from '../lib/setup-prompt'
import { isValidProjectKey, slugify } from '../lib/utils'

const METHODS = ['Prompt', 'MCP'] as const
// Studio input styling; Base UI's Input would pull a second React into the dashboard bundle.
const inputClass = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
type Method = (typeof METHODS)[number]
type KeyStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'unchecked'
/** How often to look for the first pin while the page waits for it. */
export const FIRST_PIN_POLL_MS = 5000

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
  /** Asks for the created project's comments again, so the first pin shows up without a refocus. */
  onCheckFirstPin?: () => void
  suggestedProjects?: ReactNode
}

/**
 * "New project" as a page. Name it, then hand your coding agent one prompt with the
 * project ID inside. Copying the prompt creates the project, so the ID is real by the
 * time the agent uses it.
 */
export function NewProjectPage({ apiBase, first = false, checkAvailability, onCreate, error, planRequired, firstPin = false, onOpenProject, onCheckFirstPin, suggestedProjects }: NewProjectPageProps) {
  // Keep the welcome for the whole visit: creating the first project makes `first` false.
  const [firstVisit] = useState(first)
  const [method, setMethod] = useState<Method>('Prompt')
  const [name, setName] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const [suggestion, setSuggestion] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  // The ID whose create failed. Its error only shows while that ID is still the one on screen.
  const [failedId, setFailedId] = useState<string | null>(null)
  const [recheck, setRecheck] = useState(0)
  // Set when the page picked another ID for the person, so it can say why.
  const [switched, setSwitched] = useState<{ from: string; to: string } | null>(null)
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
          // The ID can't be typed, so a taken one just becomes the server's free suggestion.
          // Only from the name's own ID: if a suggestion is taken too, offer the next one.
          if (!result.available && result.suggestion && override === null) {
            setOverride(result.suggestion)
            setSwitched({ from: key, to: result.suggestion })
            return
          }
          setStatus(result.available ? 'available' : 'taken')
        },
        () => { if (latestKey.current === key) setStatus('unchecked') },
      )
    }, 400)
    return () => clearTimeout(timer)
  }, [key, createdId, checkAvailability, recheck, override])

  // Look for the first pin while waiting, so it appears even with the dashboard in view.
  useEffect(() => {
    if (!createdId || firstPin || !onCheckFirstPin) return
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') onCheckFirstPin() }, FIRST_PIN_POLL_MS)
    return () => clearInterval(timer)
  }, [createdId, firstPin, onCheckFirstPin])

  const ready = createdId !== null || (status === 'available' && name.trim() !== '')

  // Runs before the prompt reaches the clipboard and returns the ID it may name: nothing
  // is copied unless the project exists, so a pasted prompt never names someone else's ID.
  async function create(): Promise<string | null> {
    if (createdId) return createdId
    if (creating.current || !ready) return null
    creating.current = true
    try {
      const projectName = name.trim()
      if (await onCreate(key, projectName)) {
        setCreatedId(key)
        setFailedId(null)
        return key
      }
      // Someone took the ID between the check and the copy: take the next free one, once.
      const retry = await checkAvailability(key).catch(() => null)
      const next = retry && !retry.available ? retry.suggestion : ''
      if (next && await onCreate(next, projectName)) {
        setOverride(next)
        setCreatedId(next)
        setFailedId(null)
        setSwitched({ from: key, to: next })
        return next
      }
      setFailedId(key)
      setRecheck((n) => n + 1)
      return null
    } finally {
      creating.current = false
    }
  }
  const copyWith = (text: (id: string) => string) => () => create().then((id) => (id ? text(id) : false))

  const ask = askAgent(projectId)
  const mcpUrl = new URL(`${apiBase.replace(/\/$/, '')}/mcp/v1`, window.location.origin).href
  const promptHeader = (text: string) => <span className="px-1.5 font-medium text-text-body">{text}</span>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-170 flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text-strong">{firstVisit ? 'Create your first project' : 'New project'}</h1>
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
              <input id="project-name" className={inputClass} aria-invalid={status === 'invalid' || status === 'taken'} autoFocus readOnly={createdId !== null} value={name} placeholder="Acme Marketing" onChange={(e) => { setName(e.target.value); setOverride(null); setSwitched(null) }} />
              <p className="text-xs text-text-subtle" aria-live="polite">
                Project ID <span className="font-mono text-text-body">{projectId}</span>
                {createdId ? <> · created, it’s in your sidebar.</>
                  : status === 'checking' ? <> · checking…</>
                  : status === 'invalid' ? <> · use lowercase letters, numbers and single hyphens</>
                  : status === 'taken' ? <> · taken.{suggestion && <> <button type="button" className="font-medium text-text-strong hover:underline" onClick={() => setOverride(suggestion)}>Use {suggestion}</button></>}</>
                  : status === 'unchecked' ? <> · couldn’t check if it’s free. <button type="button" className="font-medium text-text-strong hover:underline" onClick={() => setRecheck((n) => n + 1)}>Try again</button></>
                  : null}
              </p>
              {switched && switched.to === key && (
                <p role="status" className="text-xs text-text-body">
                  <span className="font-mono">{switched.from}</span> is taken, so this project uses <span className="font-mono">{switched.to}</span>{createdId ? <>. That’s the ID in the copied prompt.</> : '.'}
                </p>
              )}
              {failedId !== null && failedId === key && (
                <p role="alert" className="text-xs text-destructive">
                  {sentence(error ?? 'We couldn’t create this project')} Nothing was copied.
                </p>
              )}
            </div>

            <section aria-label="Install" className="flex flex-col gap-3">
              <SegmentedTabs label="Setup method" options={METHODS} value={method} onChange={setMethod} />
              {method === 'Prompt' ? (
                <PromptBlock highlight={[projectId]} prompt={setupPrompt(projectId)} disabled={!ready} beforeCopy={copyWith(setupPrompt)} header={promptHeader('Paste this into your coding agent')} />
              ) : (
                <>
                  <CommandBlock
                    command={`claude mcp add --transport http --scope user crrt ${mcpUrl}`}
                    steps={[
                      <>Run it in your terminal once per machine, then restart the agent in your repo. Using another client? See <a className="font-medium text-text-strong hover:underline" href={route('/mcp-auth')}>MCP connections</a>.</>,
                      <>Ask it: <InlineCode>{ask}</InlineCode></>,
                    ]}
                  />
                  <PromptBlock highlight={[projectId]} prompt={ask} disabled={!ready} beforeCopy={copyWith(askAgent)} header={promptHeader('Ask your agent')} />
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

/** Server messages may lack a full stop; add one so the next sentence doesn't run on. */
function sentence(text: string) {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** What to ask an agent that already has CRRT's MCP server. */
function askAgent(projectId: string) {
  return `Set up CRRT here as project ${projectId}.`
}
