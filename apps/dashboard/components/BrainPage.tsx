import { useCallback, useState, type FormEvent } from 'react'
import { Brain, Pencil, Trash2 } from 'lucide-react'
import { EmptyState } from '@crrt/ui/crrt'
import { createRule, deleteRule, listRules, updateRule, type BrainRule, type Project } from '../api'
import { useAccessResource } from '../hooks/useAccessResource'
import { getMockRules, mocksEnabled } from '../lib/mocks'

interface BrainPageProps {
  apiBase: string
  accessToken: string
  /** Names project rules and offers the projects you manage as a scope. */
  projects: Project[]
}

const fieldClass = 'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
const primaryClass = 'inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50'
const quietClass = 'inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-text-body ring-1 ring-border hover:bg-accent'
const iconClass = 'rounded-md p-1.5 text-text-subtle hover:bg-surface-3 hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5'

/** A 403 means the project's rules belong to its managers; say so instead of "Forbidden". */
function plainError(err: { status?: number }) {
  throw err.status === 403 ? new Error('Only people who manage this project can change its rules.') : err
}

/** The rules agents follow: workspace-wide, or for one project. */
export function BrainPage({ apiBase, accessToken, projects }: BrainPageProps) {
  const load = useCallback(() => mocksEnabled ? Promise.resolve(getMockRules()) : listRules(apiBase, accessToken), [apiBase, accessToken])
  const { data: rules, busy, error, run } = useAccessResource(load)
  // The rule being edited, 'new' for a new one, or null.
  const [editing, setEditing] = useState<BrainRule | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const managed = projects.filter((p) => p.capabilities?.includes('project:manage'))
  const canEdit = (rule: BrainRule) => rule.projectKey === null ? rule.mine : managed.some((p) => p.publicKey === rule.projectKey)
  const scope = (rule: BrainRule) => rule.projectKey === null ? 'Workspace' : projects.find((p) => p.publicKey === rule.projectKey)?.name ?? rule.projectKey

  const save = async (input: { title: string; body: string; projectKey: string | null }) => {
    const action = () => editing === 'new' ? createRule(apiBase, accessToken, input) : updateRule(apiBase, accessToken, editing!.id, { title: input.title, body: input.body })
    if (await run(() => action().catch(plainError))) setEditing(null)
  }
  const remove = (id: string) => { setConfirmDelete(null); void run(() => deleteRule(apiBase, accessToken, id).catch(plainError)) }

  const form = <RuleForm rule={editing === 'new' ? null : editing} projects={managed} busy={busy} onSave={(input) => { void save(input) }} onCancel={() => setEditing(null)} />
  return (
    <section aria-labelledby="brain-title" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end gap-3 border-b border-sidebar-border px-5 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <h1 id="brain-title" className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">Brain</h1>
          <p className="text-text-body">The rules your agents follow in every project.</p>
        </div>
        {rules && editing === null && <button type="button" onClick={() => setEditing('new')} className={`ml-auto ${primaryClass}`}>New rule</button>}
      </header>
      <div className="flex w-full max-w-200 flex-col gap-4 px-5 py-6">
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {editing === 'new' && form}
        {!rules ? (
          !error && <p role="status" className="text-xs text-text-subtle">Loading rules…</p>
        ) : rules.length === 0 ? (
          editing === null && (
            <EmptyState icon={<Brain />} title="No rules yet">
              Rules like “Keep headlines under 8 words” live here. Agents read them before they work on a next step.
            </EmptyState>
          )
        ) : (
          <ul aria-label="Rules" className="flex flex-col">
            {rules.map((rule) => editing !== 'new' && editing?.id === rule.id ? <li key={rule.id} className="py-3">{form}</li> : (
              <li key={rule.id} className="flex flex-col gap-1 border-b border-sidebar-border py-3">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 font-medium text-text-strong">{rule.title}</h2>
                  {canEdit(rule) && (confirmDelete === rule.id ? (
                    <span className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => remove(rule.id)} className="text-xs font-medium text-destructive hover:underline">Delete rule</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs font-medium text-text-body hover:underline">Keep</button>
                    </span>
                  ) : (
                    <span className="flex">
                      <button type="button" aria-label={`Edit ${rule.title}`} disabled={busy} onClick={() => setEditing(rule)} className={iconClass}><Pencil /></button>
                      <button type="button" aria-label={`Delete ${rule.title}`} disabled={busy} onClick={() => setConfirmDelete(rule.id)} className={iconClass}><Trash2 /></button>
                    </span>
                  ))}
                </div>
                <p className="whitespace-pre-line text-text-body">{rule.body}</p>
                <p className="text-xs text-text-subtle">{scope(rule)} · cited {rule.citations}×</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

interface RuleFormProps {
  /** The rule to edit; null for a new one. */
  rule: BrainRule | null
  /** Projects a new rule may belong to. */
  projects: Project[]
  busy: boolean
  onSave: (input: { title: string; body: string; projectKey: string | null }) => void
  onCancel: () => void
}

function RuleForm({ rule, projects, busy, onSave, onCancel }: RuleFormProps) {
  const [title, setTitle] = useState(rule?.title ?? '')
  const [body, setBody] = useState(rule?.body ?? '')
  const [projectKey, setProjectKey] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave({ title: title.trim(), body: body.trim(), projectKey: projectKey || null })
  }
  return (
    <form aria-label={rule ? 'Edit rule' : 'New rule'} onSubmit={submit} className="flex flex-col gap-3 rounded-lg p-4 ring-1 ring-border">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-strong">
        Title
        <input required autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Keep headlines under 8 words" className={`h-8 ${fieldClass}`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-strong">
        Rule
        <textarea required maxLength={4000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={`resize-y ${fieldClass}`} />
      </label>
      {!rule && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-strong">
          Applies to
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} className={`h-8 ${fieldClass}`}>
            <option value="">Workspace</option>
            {projects.map((p) => <option key={p.publicKey} value={p.publicKey}>{p.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={quietClass}>Cancel</button>
        <button type="submit" disabled={busy || !title.trim() || !body.trim()} className={primaryClass}>{rule ? 'Save rule' : 'Add rule'}</button>
      </div>
    </form>
  )
}
