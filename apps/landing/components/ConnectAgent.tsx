import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

const PROMPT = 'Set up CRRT for this agent. Fetch https://crrt.ai/get-started.md and follow its instructions. Use this MCP server URL: https://crrt.ai/api/mcp/v1. After setup, continue any existing user-requested task that needed CRRT once its tools are available. If the client requires a reload, preserve the task and explain how to resume it after reloading, without repeating successful setup or login. If there is no existing task, confirm readiness once verified and wait for instructions.'

export function ConnectAgent() {
  const [status, setStatus] = useState('idle')
  async function copy() {
    try { await navigator.clipboard.writeText(PROMPT); setStatus('copied') }
    catch { setStatus('error') }
  }
  return <div className="connect-agent" data-status={status}>
    <button className="ds-button ds-button-secondary ds-button-lg" type="button" onClick={() => void copy()} aria-label="Copy CRRT agent setup prompt">
      <span className="connect-agent-logos" aria-hidden="true">
        <span><img src="/agent-logos/claude.svg" alt="" width="22" height="22" /></span>
        <span><img src="/agent-logos/openai.svg" alt="" width="22" height="22" /></span>
        <span><img src="/agent-logos/cursor.svg" alt="" width="22" height="22" /></span>
      </span>
      {status === 'copied' ? 'Prompt copied' : 'Connect your agent'}
      {status === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
    <p role="status">{status === 'copied' ? 'Paste it into your coding agent. Sign in when prompted.' : 'One prompt. Connect Claude Code, Codex, Cursor, and other MCP clients.'}</p>
    <details open={status === 'error'}>
      <summary>{status === 'error' ? 'Could not copy. Select the setup prompt below.' : 'View setup prompt'}</summary>
      <p className="connect-agent-prompt">{PROMPT}</p>
    </details>
  </div>
}
