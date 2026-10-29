import { useState } from 'react'
import { BotIcon, CopyIcon, ShieldIcon } from './icons'
import { asset, landingRoute } from '../lib/routes'

function CopyField({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus('copied') }
    catch { setStatus('error') }
  }
  return <div className="space-y-2">
    <div className="flex min-w-0 flex-col-reverse items-stretch gap-3 rounded-xl border border-border bg-background p-5 sm:flex-row sm:items-start">
      <code className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] font-mono text-sm leading-7">{value}</code>
      <button type="button" aria-label={`Copy ${label}`} onClick={() => void copy()} className="inline-flex shrink-0 self-end items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <span aria-hidden="true"><CopyIcon size={14} /></span>{status === 'copied' ? 'Copied' : 'Copy'}
      </button>
    </div>
    {status === 'error' && <p role="status" className="text-xs text-muted-foreground">Could not copy. Select and copy the text above.</p>}
  </div>
}

function OnboardAgent({ prompt }: { prompt: string }) {
  const [status, setStatus] = useState('idle')
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setStatus('copied') }
    catch { setStatus('error') }
  }
  return <div className="space-y-4 py-2">
    <button type="button" aria-label="Copy setup prompt" onClick={() => void copy()} className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-1.5 pr-3 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:bg-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring sm:gap-2">
      <span className="flex shrink-0 -space-x-2" aria-hidden="true">
        {['claude', 'openai', 'cursor'].map(name => <span key={name} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white"><img src={asset(`agent-logos/${name}.svg`)} alt="" className="h-4 w-4" /></span>)}
      </span>
      <span>{status === 'copied' ? 'Copied' : 'Onboard your agent'}</span>
      <span className="text-muted-foreground" aria-hidden="true"><CopyIcon size={16} /></span>
    </button>
    <p role="status" className="text-xs text-muted-foreground">{status === 'copied' ? 'Prompt copied. Paste it into your agent to get started.' : status === 'error' ? 'Could not copy. Select and copy the prompt below.' : 'Copy the setup prompt, then paste it into your agent.'}</p>
    <details open={status === 'error'} className="text-sm text-muted-foreground">
      <summary className="w-fit cursor-pointer underline decoration-border underline-offset-4">View prompt</summary>
      <p className="mt-3 rounded-xl border border-border bg-muted/30 p-5 font-mono text-xs leading-6 text-foreground [overflow-wrap:anywhere]">{prompt}</p>
    </details>
  </div>
}

export function McpSetup({ apiBase }: { apiBase: string }) {
  const serverUrl = new URL(`${apiBase.replace(/\/$/, '')}/mcp/v1`, window.location.origin).href
  const guideUrl = new URL(landingRoute('/get-started.md'), window.location.origin).href
  const setupPrompt = `Set up CRRT for this agent. Fetch ${guideUrl} and follow its instructions. Use this MCP server URL: ${serverUrl}. After setup, continue any existing user-requested task that needed CRRT once its tools are available. If the client requires a reload, preserve the task and explain how to resume it after reloading, without repeating successful setup or login. If there is no existing task, confirm readiness once verified and wait for instructions.`
  return <div className="mx-auto max-w-5xl space-y-8">
    <section aria-labelledby="mcp-setup-heading" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-6 sm:px-8">
        <h2 id="mcp-setup-heading" className="text-lg font-semibold">Connect a client</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set up once, then bring feedback into your conversations.</p>
      </div>
      <div className="p-6 sm:p-8">
        <ol className="grid gap-8 md:grid-cols-2">
          <li className="space-y-4 md:col-span-2">
            <h3 className="text-base font-semibold">1. Ask your agent to set up CRRT</h3>
            <p className="text-sm leading-6 text-muted-foreground">Paste this prompt into Codex, Claude Code, Cursor, or another MCP-compatible agent. Your agent will follow the setup steps for its client.</p>
            <OnboardAgent prompt={setupPrompt} />
            <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Server URL</p><CopyField label="server URL" value={serverUrl} /></div>
          </li>
          <li className="space-y-4 border-t border-border pt-6">
            <h3 className="text-base font-semibold">2. Review and approve permissions</h3>
            <p className="text-sm leading-6 text-muted-foreground">Sign in with your CRRT account in the browser window that opens. Review the request, then approve the permissions shown.</p>
          </li>
          <li className="space-y-4 border-t border-border pt-6">
            <h3 className="text-base font-semibold">3. Continue your conversation</h3>
            <p className="text-sm leading-6 text-muted-foreground">Your agent checks the connection and continues your existing task once its tools are available. If a reload is needed, it tells you how to resume. If you have not given it a task yet, tell it what you want to do.</p>
            <CopyField label="example prompt" value="List my CRRT projects, then show Ready for Agent feedback for one project, grouped by page." />
          </li>
        </ol>
      </div>
    </section>
    <aside className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldIcon size={16} /> Permissions you approve</span>
        <p className="text-sm leading-6 text-muted-foreground">New connections request access to read your projects and feedback, claim accepted feedback, and report implementation progress.</p>
        <p className="text-sm leading-6 text-muted-foreground">You can also ask your client to change review or completion status. These changes require your explicit request and current project permissions.</p>
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><BotIcon size={16} /> One connection, your projects</span>
        <p className="text-sm leading-6 text-muted-foreground">MCP lets compatible tools work with your CRRT feedback. You choose the project in your conversation.</p>
        <p className="text-sm leading-6 text-muted-foreground">Existing read-only connections stay read-only until reauthorized. You can disconnect any client below, then connect again to approve new permissions.</p>
      </div>
    </aside>
  </div>
}
