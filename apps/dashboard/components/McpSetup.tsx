import { useState } from 'react'
import { BotIcon, CopyIcon, ShieldIcon } from './icons'

function CopyField({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus('copied') }
    catch { setStatus('error') }
  }
  return <div className="space-y-2">
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background p-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-6">{value}</code>
      <button type="button" aria-label={`Copy ${label}`} onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <span aria-hidden="true"><CopyIcon size={14} /></span>{status === 'copied' ? 'Copied' : 'Copy'}
      </button>
    </div>
    {status === 'error' && <p role="status" className="text-xs text-muted-foreground">Could not copy. Select and copy the text above.</p>}
  </div>
}

export function McpSetup({ apiBase }: { apiBase: string }) {
  const [client, setClient] = useState<'codex' | 'claude' | 'other'>('codex')
  const serverUrl = new URL(`${apiBase.replace(/\/$/, '')}/mcp/v1`, window.location.origin).href
  const command = `${client === 'claude' ? 'claude mcp add --transport http crrt' : 'codex mcp add crrt --url'} '${serverUrl.replace(/'/g, "'\\''")}'`
  return <div className="grid items-start gap-8 lg:grid-cols-3">
    <section aria-labelledby="mcp-setup-heading" className="min-w-0 rounded-xl border border-border bg-card lg:col-span-2">
      <div className="border-b border-border px-6 py-5">
        <h2 id="mcp-setup-heading" className="text-base font-semibold">Connect a client</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set up once, then bring feedback into your conversations.</p>
      </div>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose your MCP client">
          {(['codex', 'claude', 'other'] as const).map(value => <button key={value} type="button" aria-pressed={client === value} onClick={() => setClient(value)} className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${client === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
            {value === 'codex' ? 'Codex CLI' : value === 'claude' ? 'Claude Code' : 'Others'}
          </button>)}
        </div>
        <ol className="space-y-6">
          <li className="space-y-3">
            <h3 className="text-sm font-semibold">1. Add CRRT to your client</h3>
            {client !== 'other' ? <>
              <p className="text-sm leading-6 text-muted-foreground">{client === 'claude' ? 'Run this command in the folder where you use Claude Code.' : 'Run this command in your terminal. Codex will start the authorization flow.'}</p>
              <CopyField key={client} label={client === 'claude' ? 'Claude Code command' : 'Codex command'} value={command} />
            </> : <p className="text-sm leading-6 text-muted-foreground">In your client’s MCP settings, add a remote server using the URL below. Choose Streamable HTTP and OAuth authentication, then connect.</p>}
            <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Server URL</p><CopyField label="server URL" value={serverUrl} /></div>
          </li>
          <li className="space-y-2">
            <h3 className="text-sm font-semibold">2. Review and approve permissions</h3>
            {client === 'claude' && <p className="text-sm leading-6 text-muted-foreground">Open Claude Code in that folder, enter <code className="font-mono">/mcp</code>, select <code className="font-mono">crrt</code>, and choose Authenticate.</p>}
            <p className="text-sm leading-6 text-muted-foreground">Sign in with your CRRT account in the browser window that opens. Review the request, then approve the permissions shown.</p>
            {client === 'codex' && <p className="text-xs leading-5 text-muted-foreground">If Codex does not open authorization, run <code className="font-mono">codex mcp login crrt</code>. After connecting, start a new conversation.</p>}
          </li>
          <li className="space-y-3">
            <h3 className="text-sm font-semibold">3. Try your first conversation</h3>
            <CopyField label="example prompt" value="List my CRRT projects, then show Ready for Agent feedback for one project, grouped by page." />
          </li>
        </ol>
      </div>
    </section>
    <aside className="space-y-6 py-1">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldIcon size={16} /> Permissions you approve</span>
        <p className="text-sm leading-6 text-muted-foreground">New connections request access to read your projects and feedback, claim accepted feedback, and report implementation progress.</p>
        <p className="text-sm leading-6 text-muted-foreground">You can also ask your client to change review or completion status. These changes require your explicit request and current project permissions.</p>
      </div>
      <div className="space-y-3 border-t border-border pt-6">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><BotIcon size={16} /> One connection, your projects</span>
        <p className="text-sm leading-6 text-muted-foreground">MCP lets compatible tools work with your CRRT feedback. You choose the project in your conversation.</p>
        <p className="text-sm leading-6 text-muted-foreground">Existing read-only connections stay read-only until reauthorized. You can disconnect any client below, then connect again to approve new permissions.</p>
      </div>
    </aside>
  </div>
}
