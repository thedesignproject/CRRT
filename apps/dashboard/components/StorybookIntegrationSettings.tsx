import { useCallback, useEffect, useRef, useState } from 'react'
import {
  beginBillingCheckout,
  createStorybookPairing,
  getStorybookIntegration,
  type StorybookIntegration,
} from '../api'
import { mocksEnabled } from '../lib/mocks'
import { cn } from '../lib/utils'
import { ExternalLinkIcon } from './icons'
import { Spinner } from './primitives'

type LocalState = StorybookIntegration | {
  state: 'authentication_required' | 'error'
  message: string
}

interface StorybookIntegrationSettingsProps {
  apiBase: string
  accessToken: string
  projectKey: string
  appearance?: 'settings' | 'setup'
  canManage?: boolean
  navigateToCheckout?: (url: string) => void
}

const button = 'inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold transition-[color,background-color,border-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'

function errorState(error: unknown): LocalState {
  const requestError = error as Error & { status?: number; code?: string }
  if (requestError.status === 401 || requestError.code === 'authentication_required') {
    return { state: 'authentication_required', message: 'Your CRRT session expired. Sign in again, then retry.' }
  }
  if (
    requestError.status === 402
    || requestError.code === 'upgrade_required'
    || requestError.code === 'owner_upgrade_required'
  ) {
    return { state: 'upgrade_required', message: 'Storybook is included with CRRT Pro.' }
  }
  if (requestError.status === 410 || requestError.code === 'pairing_expired') {
    return { state: 'expired', message: 'This connection command expired. Generate a fresh one.' }
  }
  return {
    state: 'error',
    message: requestError.message || 'CRRT could not load the Storybook connection.',
  }
}

function safeStorybookUrl(value?: string) {
  if (!value) return null
  try {
    const url = new URL(value)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    return url.protocol === 'https:' || (local && url.protocol === 'http:') ? url.toString() : null
  } catch {
    return null
  }
}

function mockPairing(projectKey: string): StorybookIntegration {
  return {
    state: 'waiting',
    command: `npx @thedesignproject/crrt-storybook connect --code demo-${projectKey}`,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
}

export function StorybookIntegrationSettings({
  apiBase,
  accessToken,
  projectKey,
  appearance = 'settings',
  canManage = true,
  navigateToCheckout = (url) => window.location.assign(url),
}: StorybookIntegrationSettingsProps) {
  const [integration, setIntegration] = useState<LocalState | null>(null)
  const [busy, setBusy] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const sequence = useRef(0)
  const mockCurrent = useRef<StorybookIntegration | null>(null)

  const load = useCallback(async (completeMockPairing = false) => {
    const request = ++sequence.current
    setBusy(true)
    setCopyState('idle')
    try {
      let next: StorybookIntegration
      if (!canManage) {
        next = { state: 'not_connected' }
      } else if (mocksEnabled) {
        next = completeMockPairing && mockCurrent.current?.state === 'waiting'
          ? {
              state: 'connected',
              connectionId: `sbconn_${projectKey}`,
              storybookUrl: 'http://localhost:6008',
              connectedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            }
          : mockCurrent.current ?? { state: 'not_connected' }
        mockCurrent.current = next
      } else {
        next = await getStorybookIntegration(apiBase, accessToken, projectKey)
      }
      if (request === sequence.current) setIntegration(next)
    } catch (error) {
      if (request === sequence.current) setIntegration(errorState(error))
    } finally {
      if (request === sequence.current) setBusy(false)
    }
  }, [accessToken, apiBase, canManage, projectKey])

  useEffect(() => {
    sequence.current += 1
    mockCurrent.current = null
    setIntegration(null)
    void load()
    return () => { sequence.current += 1 }
  }, [load])

  useEffect(() => {
    if (integration?.state !== 'waiting' || !integration.expiresAt) return
    const remaining = Date.parse(integration.expiresAt) - Date.now()
    if (remaining <= 0) {
      setIntegration({ state: 'expired', message: 'This connection command expired. Generate a fresh one.' })
      return
    }
    const timeout = window.setTimeout(() => {
      setIntegration({ state: 'expired', message: 'This connection command expired. Generate a fresh one.' })
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [integration])

  async function createPairing() {
    const request = ++sequence.current
    setBusy(true)
    setCopyState('idle')
    try {
      const next = mocksEnabled
        ? mockPairing(projectKey)
        : await createStorybookPairing(apiBase, accessToken, projectKey)
      if (request !== sequence.current) return
      mockCurrent.current = next
      setIntegration(next)
    } catch (error) {
      if (request === sequence.current) setIntegration(errorState(error))
    } finally {
      if (request === sequence.current) setBusy(false)
    }
  }

  async function copyCommand(command: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText(command)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  async function upgrade() {
    setBusy(true)
    try {
      const checkout = await beginBillingCheckout(apiBase, accessToken)
      navigateToCheckout(checkout.url)
    } catch (error) {
      setIntegration(errorState(error))
      setBusy(false)
    }
  }

  const content = (
    <div className="space-y-4">
      {!integration ? (
        <div className="flex items-center justify-center py-5" aria-label="Loading Storybook connection">
          <Spinner size={16} />
        </div>
      ) : integration.state === 'not_connected' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">{canManage ? 'No Storybook connected' : 'Storybook is managed by the project owner'}</p>
            <p className="mt-1 max-w-md text-[11px] text-muted-foreground">
              {canManage
                ? integration.message ?? 'Add CRRT to an existing Storybook 10 project with one command.'
                : 'Ask the owner to connect or replace Storybook.'}
            </p>
          </div>
          {canManage ? (
            <button type="button" disabled={busy} onClick={() => { void createPairing() }} className={cn(button, 'w-full bg-primary text-primary-foreground hover:opacity-90 sm:w-auto')}>
              {busy ? 'Preparing…' : 'Connect Storybook'}
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground">Only the project owner can manage this connection.</p>
          )}
        </div>
      ) : integration.state === 'waiting' && integration.command ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Run this in your Storybook project</p>
              <p className="mt-1 text-[11px] text-muted-foreground">The command expires soon and can connect only this project.</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Waiting</span>
          </div>
          <div className="mt-3 flex min-w-0 flex-col gap-2 rounded-md border border-border bg-background p-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto px-1 py-1 font-mono text-[12px] leading-5 text-foreground">{integration.command}</code>
            <button type="button" onClick={() => { void copyCommand(integration.command!) }} className={cn(button, 'shrink-0 border border-border bg-card text-foreground hover:bg-accent')}>
              {copyState === 'copied' ? 'Copied' : 'Copy command'}
            </button>
          </div>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span aria-live="polite" className={cn('text-[11px]', copyState === 'error' ? 'text-status-rejected' : 'text-muted-foreground')}>
              {copyState === 'copied' && 'Command copied.'}
              {copyState === 'error' && 'Copy failed. Select the command and copy it manually.'}
            </span>
            <button type="button" disabled={busy} onClick={() => { void load(true) }} className={cn(button, 'border border-border text-foreground hover:bg-accent')}>
              {busy ? 'Checking…' : 'Check connection'}
            </button>
          </div>
        </div>
      ) : integration.state === 'connected' ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Storybook connected</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Component feedback will arrive in this CRRT project with its story context.</p>
            </div>
            <span className="shrink-0 rounded-full bg-status-accepted-bg px-2 py-0.5 text-[10px] font-semibold text-status-accepted">Connected</span>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" disabled={busy || !canManage} onClick={() => { void createPairing() }} className="rounded-sm text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              Connect a different Storybook
            </button>
            {safeStorybookUrl(integration.storybookUrl) && (
              <a href={safeStorybookUrl(integration.storybookUrl)!} target="_blank" rel="noreferrer" className={cn(button, 'gap-1.5 border border-border text-foreground hover:bg-accent')}>
                Open Storybook <ExternalLinkIcon size={12} />
              </a>
            )}
          </div>
        </div>
      ) : integration.state === 'upgrade_required' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Storybook is a Pro integration</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Upgrade this project to connect components and send feedback to Agent.</p>
          </div>
          <button type="button" disabled={busy || !canManage} onClick={() => { void upgrade() }} className={cn(button, 'w-full bg-primary text-primary-foreground hover:opacity-90 sm:w-auto')}>
            {busy ? 'Opening…' : 'Upgrade to Pro'}
          </button>
        </div>
      ) : integration.state === 'authentication_required' ? (
        <Recovery title="Sign in again" message={integration.message} action="Retry" busy={busy} onAction={() => { void load() }} />
      ) : integration.state === 'expired' ? (
        <Recovery title="Connection command expired" message={integration.message ?? 'Generate a fresh command to continue.'} action="Generate new command" busy={busy} onAction={() => { void createPairing() }} />
      ) : (
        <Recovery title="Storybook connection unavailable" message={integration.message ?? 'CRRT could not load the Storybook connection.'} action="Retry" busy={busy} onAction={() => { void load() }} error />
      )}

      <details className="border-t border-border pt-3 text-[11px] text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">Advanced</summary>
        <div className="mt-2 space-y-1.5">
          <p>Requires Storybook 10 with React and Node 20.19 or newer.</p>
          <p>Already connected? Run <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">npx @thedesignproject/crrt-storybook doctor</code>.</p>
        </div>
      </details>
    </div>
  )

  if (appearance === 'setup') {
    return <div className="rounded-xl border border-border bg-card p-4 sm:p-5">{content}</div>
  }

  return (
    <section className="mt-8" aria-labelledby="storybook-integration-heading">
      <h2 id="storybook-integration-heading" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Storybook</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Review components and send precise story feedback into this project.</p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4">{content}</div>
    </section>
  )
}

function Recovery({ title, message, action, busy, onAction, error = false }: {
  title: string
  message: string
  action: string
  busy: boolean
  onAction: () => void
  error?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role={error ? 'alert' : 'status'}>
      <div>
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className={cn('mt-1 text-[11px]', error ? 'text-status-rejected' : 'text-muted-foreground')}>{message}</p>
      </div>
      <button type="button" disabled={busy} onClick={onAction} className={cn(button, 'w-full border border-border text-foreground hover:bg-accent sm:w-auto')}>
        {busy ? 'Working…' : action}
      </button>
    </div>
  )
}
